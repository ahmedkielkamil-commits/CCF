const { createClient } = require('redis');
const env = require('../config/env');
const { safeLog } = require('../bus/hipaa/safeLog');
const { REDIS_KEYS } = require('../constants');
const { liveEntries } = require('../features/_shared/sync-mysql');
const { normalizeRedisEntry } = require('../utils/datetime');

const client = createClient({
  url: env.redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

let reseedInFlight = null;

client.on('error', (err) => {
  safeLog.error('Redis client error', { message: err.message });
});

client.on('ready', () => {
  reseedLiveQueueFromMysql('redis_ready').catch((err) => {
    safeLog.error('Redis reseed failed', { message: err.message });
  });
});

async function clearLiveQueueKeys() {
  const keysToDelete = [REDIS_KEYS.live];
  for await (const key of client.scanIterator({ MATCH: `${REDIS_KEYS.entry('*')}` })) {
    keysToDelete.push(key);
  }
  if (keysToDelete.length) {
    await client.del(keysToDelete);
  }
}

async function repairLiveQueueTimestamps() {
  if (!client.isOpen) return { repaired: 0 };
  let repaired = 0;
  for await (const key of client.scanIterator({ MATCH: `${REDIS_KEYS.entry('*')}` })) {
    const raw = await client.get(key);
    if (!raw) continue;
    const entry = JSON.parse(raw);
    const normalized = normalizeRedisEntry(entry);
    if (normalized.checked_in_at !== entry.checked_in_at) {
      await client.set(key, JSON.stringify(normalized));
      repaired += 1;
    }
  }
  if (repaired > 0) {
    safeLog.info('Repaired Redis queue entry timestamps', { repaired });
  }
  return { repaired };
}

async function reseedLiveQueueFromMysql(reason = 'manual') {
  if (!client.isOpen) return { seeded: false, reason: 'redis_closed' };
  if (reseedInFlight) return reseedInFlight;

  reseedInFlight = (async () => {
    let rows = [];
    try {
      rows = await liveEntries();
    } catch (err) {
      safeLog.warn('Skipping Redis reseed; MySQL unavailable', { reason, message: err.message });
      try {
        await repairLiveQueueTimestamps();
      } catch (repairErr) {
        safeLog.warn('Redis timestamp repair skipped', { message: repairErr.message });
      }
      return { seeded: false, reason: 'mysql_unavailable' };
    }

    await clearLiveQueueKeys();

    if (rows.length > 0) {
      const multi = client.multi();
      for (const row of rows) {
        const entryId = Number(row.entryid);
        const position = Number(row.position);
        multi.zAdd(REDIS_KEYS.live, { score: position, value: String(entryId) });
        multi.set(
          REDIS_KEYS.entry(entryId),
          JSON.stringify(
            normalizeRedisEntry({
              entryid: entryId,
              registrationid: Number(row.registrationid),
              fname: row.fname,
              lname: row.lname,
              symptoms: row.symptoms,
              checked_in_at: row.checked_in_at,
              position,
              status: row.status,
            })
          )
        );
      }
      await multi.exec();
    }

    safeLog.info('Redis reseeded from MySQL', { reason, liveRows: rows.length });
    return { seeded: true, rows: rows.length };
  })().finally(() => {
    reseedInFlight = null;
  });

  return reseedInFlight;
}

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
    safeLog.info('Redis connected');
  }
}

async function closeRedis() {
  if (client.isOpen) {
    await client.quit();
  }
}

module.exports = { client, connectRedis, closeRedis, reseedLiveQueueFromMysql, repairLiveQueueTimestamps };
