const crypto = require('crypto');
const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');

const RESUME_TOKEN_TTL_SECONDS = 60 * 60 * 24;

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function createCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function createUniqueCode() {
  for (let i = 0; i < 8; i++) {
    const code = createCode();
    const exists = await client.exists(REDIS_KEYS.resumeCode(code));
    if (!exists) return code;
  }
  const e = new Error('Could not generate unique resume code');
  e.status = 503;
  throw e;
}

async function issueResumeToken(registrationId, entryIds) {
  const regId = Number(registrationId);
  const regKey = REDIS_KEYS.resumeRegistration(regId);
  const priorRaw = await client.get(regKey);
  if (priorRaw) {
    const prior = JSON.parse(priorRaw);
    if (prior.token) await client.del(REDIS_KEYS.resumeToken(prior.token));
    if (prior.code) await client.del(REDIS_KEYS.resumeCode(prior.code));
  }

  const token = createToken();
  const code = await createUniqueCode();
  const tokenKey = REDIS_KEYS.resumeToken(token);
  const payload = JSON.stringify({
    registrationid: regId,
    code,
    entryids: entryIds.map((id) => Number(id)),
    issuedAt: new Date().toISOString(),
  });

  const multi = client.multi();
  multi.setEx(tokenKey, RESUME_TOKEN_TTL_SECONDS, payload);
  multi.setEx(REDIS_KEYS.resumeCode(code), RESUME_TOKEN_TTL_SECONDS, token);
  multi.setEx(regKey, RESUME_TOKEN_TTL_SECONDS, JSON.stringify({ token, code }));
  await multi.exec();
  return { token, code };
}

async function addEntriesToResumeToken(registrationId, entryIds) {
  const regId = Number(registrationId);
  const regKey = REDIS_KEYS.resumeRegistration(regId);
  const rawReg = await client.get(regKey);
  if (!rawReg) return null;

  const { token, code } = JSON.parse(rawReg);
  if (!token) return null;
  const tokenKey = REDIS_KEYS.resumeToken(token);
  const rawToken = await client.get(tokenKey);
  if (!rawToken) return null;

  const payload = JSON.parse(rawToken);
  const ttl = await client.ttl(tokenKey);
  const resolvedTtl = ttl > 0 ? ttl : RESUME_TOKEN_TTL_SECONDS;

  const merged = new Set((payload.entryids || []).map((id) => Number(id)));
  for (const id of entryIds) merged.add(Number(id));
  payload.entryids = [...merged];

  const multi = client.multi();
  multi.setEx(tokenKey, resolvedTtl, JSON.stringify(payload));
  if (code) multi.expire(REDIS_KEYS.resumeCode(code), resolvedTtl);
  multi.expire(regKey, resolvedTtl);
  await multi.exec();
  return { token, code };
}

async function getResumeSession(token) {
  const raw = await client.get(REDIS_KEYS.resumeToken(token));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const regKey = REDIS_KEYS.resumeRegistration(parsed.registrationid);

  const multi = client.multi();
  multi.expire(REDIS_KEYS.resumeToken(token), RESUME_TOKEN_TTL_SECONDS);
  multi.expire(REDIS_KEYS.resumeCode(parsed.code), RESUME_TOKEN_TTL_SECONDS);
  multi.expire(regKey, RESUME_TOKEN_TTL_SECONDS);
  await multi.exec();

  return { ...parsed, token };
}

async function getResumeSessionByCode(code) {
  const token = await client.get(REDIS_KEYS.resumeCode(code));
  if (!token) return null;
  return getResumeSession(token);
}

async function cleanupIfRegistrationNotLive(registrationId) {
  const regId = Number(registrationId);
  const raw = await client.get(REDIS_KEYS.resumeRegistration(regId));
  if (!raw) return;
  const { token, code } = JSON.parse(raw);

  const liveIds = await client.zRange(REDIS_KEYS.live, 0, -1);
  let hasLiveEntry = false;

  for (const entryId of liveIds) {
    const raw = await client.get(REDIS_KEYS.entry(entryId));
    if (!raw) continue;
    const entry = JSON.parse(raw);
    if (Number(entry.registrationid) === regId) {
      hasLiveEntry = true;
      break;
    }
  }

  if (!hasLiveEntry) {
    const multi = client.multi();
    multi.del(REDIS_KEYS.resumeRegistration(regId));
    if (token) multi.del(REDIS_KEYS.resumeToken(token));
    if (code) multi.del(REDIS_KEYS.resumeCode(code));
    await multi.exec();
  }
}

module.exports = {
  issueResumeToken,
  addEntriesToResumeToken,
  getResumeSession,
  getResumeSessionByCode,
  cleanupIfRegistrationNotLive,
};
