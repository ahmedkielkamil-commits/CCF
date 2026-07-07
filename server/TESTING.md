# CCoF Backend — Manual Smoke Tests

## Dev UI (HTML, no CSS)

With the server running, open in a browser:

- http://localhost:8080/ — home + health check
- http://localhost:8080/parent.html — check-in form + live queue
- http://localhost:8080/staff.html — staff queue + roomed / no-show actions

Pages use the REST API and Socket.io `queue:update` events from the same origin.

## Prerequisites

1. Apply schema: `mysql -u root -p ccof_walkin < ../CCoFSchema.sql`
2. Redis: local `redis-server` or Redis Cloud URL in `.env` (use `redis://` unless your endpoint requires TLS — then `rediss://`)
3. Copy env: `cp .env.example .env` and set MySQL + Redis credentials
4. Install and start: `npm install && npm run dev`

## Health check

```bash
curl -s http://localhost:8080/health
curl -s http://localhost:8080/api/queue
```

Expected: `{"ok":true}`

## Add patient (check-in)

```bash
curl -s -X POST http://localhost:8080/api/check-in \
  -H "Content-Type: application/json" \
  -d '{
    "parent_fname": "Jane",
    "parent_lname": "Doe",
    "phone": "5551234567",
    "additional_notes": null,
    "sms_opt_in": true,
    "children": [
      { "fname": "Tim", "lname": "Doe", "symptoms": "Fever" },
      { "fname": "Amy", "lname": "Doe", "symptoms": "Cough" }
    ]
  }'
```

Expected: `201` with `registrationid` and `entries` array (one per child, sequential positions).

## Remove entry (roomed or no_show)

Replace `ENTRY_ID` with an `entryid` from the check-in response:

```bash
curl -s -X PATCH "http://localhost:8080/api/queue/ENTRY_ID" \
  -H "Content-Type: application/json" \
  -d '{ "status": "roomed", "staff_name": "Sarah" }'
```

Expected: `200` with updated `queue` payload; removed entry absent; remaining positions decremented.

No-show:

```bash
curl -s -X PATCH "http://localhost:8080/api/queue/ENTRY_ID" \
  -H "Content-Type: application/json" \
  -d '{ "status": "no_show", "staff_name": "Sarah" }'
```

## WebSocket broadcast

In a second terminal, run a one-liner with `socket.io-client` (install globally or use npx):

```bash
npx -y socket.io-client "http://localhost:8080"
```

Or save as `listen.js` in `server/`:

```js
const { io } = require('socket.io-client');
const socket = io('http://localhost:8080');
socket.on('queue:update', (data) => {
  console.log('queue:update', JSON.stringify(data, null, 2));
});
```

Run `node listen.js`, then run the check-in and PATCH curls above. Each operation should print a `queue:update` event with `entries` and `estimatedWait` per position.

## Wait interval (dynamic / override)

```bash
# Current interval (dynamic from today's roomed events, override, or 15 min default)
curl -s http://localhost:8080/api/clinic/wait-interval

# Staff manual override (any minutes >= 10; not capped at 30)
curl -s -X PUT http://localhost:8080/api/clinic/wait-interval \
  -H "Content-Type: application/json" \
  -d '{"minutes": 22, "staff_name": "Sarah"}'

# Clear override → back to dynamic/default
curl -s -X DELETE http://localhost:8080/api/clinic/wait-interval
```

Queue payloads include `roomingInterval` plus per-entry `estimatedWait` ranges.

## Seed Redis from MySQL dummy data

`public/dummy.json` mirrors MySQL live-queue rows (entries 1–3). Load into Redis:

```bash
cd server
pip install -r scripts/requirements.txt
python scripts/seed_redis.py
```

Uses `REDIS_URL` from `server/.env`. Then refresh http://localhost:8080/staff.html .

## HIPAA controls

### 1. Staff IP allowlist

Staff-only routes: `PATCH /api/queue/:entryId`, `PUT /api/clinic/wait-interval`,
`DELETE /api/clinic/wait-interval`, `GET /api/sync`.

**Dev (STAFF_ALLOWED_IPS empty) — all IPs allowed, warning logged once:**

```bash
# Works from any IP in dev
curl -s -X GET http://localhost:8080/api/sync
```

**Test the block (set a fake allowlist in .env, restart, then test from a different IP):**

```bash
# In server/.env temporarily:
# STAFF_ALLOWED_IPS=10.0.0.1

# This should return 403:
curl -s -X GET http://localhost:8080/api/sync
# Expected: {"error":"Forbidden"}

# Public route still works:
curl -s http://localhost:8080/api/queue
# Expected: queue payload
curl -s -X POST http://localhost:8080/api/check-in \
  -H "Content-Type: application/json" \
  -d '{"parent_fname":"Jane","parent_lname":"Doe","phone":"5551234567","sms_opt_in":false,"children":[{"fname":"Tim","lname":"Doe","symptoms":"Fever"}]}'
# Expected: 201
```

**Add your local machine IP to allowlist:**

```bash
# Find your LAN IP:
ipconfig getifaddr en0   # macOS
# Set in .env: STAFF_ALLOWED_IPS=192.168.1.42
# Restart server — staff routes work again from that IP
```

### 2. HTTPS enforcement (production only)

`enforceHttps` middleware returns 403 for plain HTTP when `NODE_ENV=production`.
Localhost is always allowed regardless.

```bash
# Simulate production rejection (NODE_ENV=production, plain HTTP):
NODE_ENV=production node src/index.js &
curl -s http://localhost:8080/api/queue
# Expected: {"error":"HTTPS required"}

# With X-Forwarded-Proto header (as Cloud Run sets):
curl -s -H "X-Forwarded-Proto: https" http://localhost:8080/api/queue
# Expected: queue payload (passes through)
```

In real production (Cloud Run): TLS is terminated by the load balancer, which forwards
`X-Forwarded-Proto: https`. No self-signed cert is needed in the container.

### 3. PHI never in logs — verify

```bash
# Run the server then check-in a patient
curl -s -X POST http://localhost:8080/api/check-in \
  -H "Content-Type: application/json" \
  -d '{"parent_fname":"Jane","parent_lname":"Doe","phone":"5559999999","sms_opt_in":false,"children":[{"fname":"Tim","lname":"Doe","symptoms":"Headache"}]}'

# Inspect terminal output — you should see NO occurrence of:
# "Jane", "Doe", "5559999999", "Tim", "Headache"
# Only IDs, status codes, and generic messages should appear.
```

Grep the source to confirm no raw PHI logging:

```bash
# Should return 0 results (only safeLog.* calls, no raw console.* with body):
rg "console\.(log|error|warn)" server/src/
```

## Redis inspection (optional)

```bash
redis-cli ZRANGE queue:live 0 -1 WITHSCORES
redis-cli KEYS 'queue:entry:*'
```

After roomed/no_show, the removed `entryid` should no longer appear in `queue:live`.
