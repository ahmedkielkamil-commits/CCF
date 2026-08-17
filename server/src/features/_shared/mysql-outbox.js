const waitingMysql = require('../waiting/mysql');
const arrivedMysql = require('../arrived/mysql');
const roomedMysql = require('../roomed/mysql');
const completedMysql = require('../completed/mysql');
const noShowMysql = require('../no_show/mysql');
const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');
const { safeLog } = require('../../bus/hipaa/safeLog');
const { canUseMysql, canUseRedis } = require('./store-health');
const { addEntriesToResumeToken } = require('./resume-token');
const { normalizeRedisEntry } = require('../../utils/datetime');

const RESUME_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const MAX_BATCH = 50;

async function enqueueCheckIn(event) {
  const payload = { type: 'check_in', ...event, enqueuedAt: new Date().toISOString() };
  await client.rPush(REDIS_KEYS.mysqlOutbox, JSON.stringify(payload));
}

async function enqueueStatusUpdate(event) {
  const payload = { type: 'status_update', ...event, enqueuedAt: new Date().toISOString() };
  await client.rPush(REDIS_KEYS.mysqlOutbox, JSON.stringify(payload));
}

async function enqueueAppendChildren(event) {
  const payload = { type: 'append_children', ...event, enqueuedAt: new Date().toISOString() };
  await client.rPush(REDIS_KEYS.mysqlOutbox, JSON.stringify(payload));
}

async function processOutbox({ maxBatch = MAX_BATCH } = {}) {
  if (!(await canUseMysql()) || !(await canUseRedis())) {
    return { processed: 0, pending: await safeLen() };
  }

  let processed = 0;
  let pending = await safeLen();
  while (processed < maxBatch && pending > 0) {
    const raw = await client.lIndex(REDIS_KEYS.mysqlOutbox, 0);
    if (!raw) break;

    let event;
    try {
      event = JSON.parse(raw);
    } catch (err) {
      safeLog.error('Dropping malformed outbox event', { message: err.message });
      await client.lPop(REDIS_KEYS.mysqlOutbox);
      processed += 1;
      pending -= 1;
      continue;
    }

    try {
      if (event.type === 'check_in') {
        await applyCheckInEvent(event);
      } else if (event.type === 'append_children') {
        await applyAppendChildrenEvent(event);
      } else if (event.type === 'status_update') {
        await applyStatusEvent(event);
      } else {
        safeLog.warn('Dropping unknown outbox event type', { type: event.type || 'unknown' });
      }
      await client.lPop(REDIS_KEYS.mysqlOutbox);
      processed += 1;
      pending -= 1;
    } catch (err) {
      safeLog.error('Outbox replay failed; will retry', {
        type: event.type || 'unknown',
        message: err.message,
      });
      break;
    }
  }

  return { processed, pending: await safeLen() };
}

async function applyCheckInEvent(event) {
  const { registrationid, entries } = await waitingMysql.insert(event.body, event.positions, {
    checkedInAt: event.checkedInAt,
  });

  const tempEntryIds = Array.isArray(event.tempEntryIds) ? event.tempEntryIds.map((id) => Number(id)) : [];
  const realEntryIds = entries.map((entry) => Number(entry.entryid));
  await promoteRedisEntries({
    tempRegistrationId: Number(event.tempRegistrationId),
    realRegistrationId: Number(registrationid),
    tempEntryIds,
    realEntryIds,
  });

  // Record the temp -> real registration mapping so later append_children events
  // queued during the same MySQL outage can resolve their parent registration.
  try {
    await client.setEx(
      REDIS_KEYS.tempRegistrationMap(Number(event.tempRegistrationId)),
      RESUME_TOKEN_TTL_SECONDS,
      String(registrationid)
    );
  } catch (_err) {
    // Non-fatal: append replay falls back to a retry if the mapping is missing.
  }
}

async function applyAppendChildrenEvent(event) {
  let realRegistrationId = Number(event.registrationid);
  if (realRegistrationId < 0) {
    const mapped = await client.get(REDIS_KEYS.tempRegistrationMap(realRegistrationId));
    if (!mapped) {
      // The owning registration has not been promoted yet; retry on the next pass.
      throw new Error(`No registration mapping for temp id ${realRegistrationId}`);
    }
    realRegistrationId = Number(mapped);
  }

  const { entries } = await waitingMysql.appendChildren(
    realRegistrationId,
    event.children,
    event.positions
  );

  const tempEntryIds = Array.isArray(event.tempEntryIds) ? event.tempEntryIds.map((id) => Number(id)) : [];
  const realEntryIds = entries.map((entry) => Number(entry.entryid));
  await promoteAppendedRedisEntries({ realRegistrationId, tempEntryIds, realEntryIds });
}

async function promoteAppendedRedisEntries({ realRegistrationId, tempEntryIds, realEntryIds }) {
  for (let i = 0; i < tempEntryIds.length; i++) {
    const tempId = Number(tempEntryIds[i]);
    const realId = Number(realEntryIds[i]);
    const score = await client.zScore(REDIS_KEYS.live, String(tempId));
    const raw = await client.get(REDIS_KEYS.entry(tempId));
    if (!raw) continue;
    const entry = JSON.parse(raw);
    const next = normalizeRedisEntry({ ...entry, entryid: realId, registrationid: realRegistrationId });

    const multi = client.multi();
    if (score !== null) {
      multi.zRem(REDIS_KEYS.live, String(tempId));
      multi.zAdd(REDIS_KEYS.live, { score: Number(score), value: String(realId) });
    }
    multi.del(REDIS_KEYS.entry(tempId));
    multi.set(REDIS_KEYS.entry(realId), JSON.stringify(next));
    await multi.exec();
  }

  try {
    await addEntriesToResumeToken(realRegistrationId, realEntryIds);
  } catch (_err) {
    // Resume token entry list is informational; non-fatal if it cannot be refreshed.
  }
}

async function applyStatusEvent(event) {
  const entryId = Number(event.entryId);
  const audit = event.audit || null;
  if (event.status === 'arrived') {
    await arrivedMysql.apply(entryId, audit);
    return;
  }
  if (event.status === 'completed') {
    await completedMysql.apply(entryId, audit);
    return;
  }
  if (event.status === 'roomed') {
    await roomedMysql.apply(entryId, audit);
    await roomedMysql.shift(Number(event.removedPosition));
    return;
  }
  if (event.status === 'no_show') {
    await noShowMysql.apply(entryId, audit);
    if (Number.isFinite(Number(event.removedPosition))) {
      await noShowMysql.shift(Number(event.removedPosition));
    }
    return;
  }
  throw new Error(`Unsupported status outbox event: ${event.status}`);
}

async function promoteRedisEntries({
  tempRegistrationId,
  realRegistrationId,
  tempEntryIds,
  realEntryIds,
}) {
  for (let i = 0; i < tempEntryIds.length; i++) {
    const tempId = Number(tempEntryIds[i]);
    const realId = Number(realEntryIds[i]);
    const score = await client.zScore(REDIS_KEYS.live, String(tempId));
    const raw = await client.get(REDIS_KEYS.entry(tempId));
    if (!raw) continue;
    const entry = JSON.parse(raw);
    const next = normalizeRedisEntry({
      ...entry,
      entryid: realId,
      registrationid: realRegistrationId,
    });

    const multi = client.multi();
    if (score !== null) {
      multi.zRem(REDIS_KEYS.live, String(tempId));
      multi.zAdd(REDIS_KEYS.live, { score: Number(score), value: String(realId) });
    }
    multi.del(REDIS_KEYS.entry(tempId));
    multi.set(REDIS_KEYS.entry(realId), JSON.stringify(next));
    await multi.exec();
  }

  await migrateResumeRegistration(tempRegistrationId, realRegistrationId, tempEntryIds, realEntryIds);
}

async function migrateResumeRegistration(
  tempRegistrationId,
  realRegistrationId,
  tempEntryIds,
  realEntryIds
) {
  const tempRegKey = REDIS_KEYS.resumeRegistration(tempRegistrationId);
  const rawReg = await client.get(tempRegKey);
  if (!rawReg) return;

  const { token, code } = JSON.parse(rawReg);
  const tokenKey = token ? REDIS_KEYS.resumeToken(token) : null;
  const codeKey = code ? REDIS_KEYS.resumeCode(code) : null;
  const ttl = tokenKey ? await client.ttl(tokenKey) : -1;
  const resolvedTtl = ttl > 0 ? ttl : RESUME_TOKEN_TTL_SECONDS;

  if (tokenKey) {
    const rawToken = await client.get(tokenKey);
    if (rawToken) {
      const payload = JSON.parse(rawToken);
      payload.registrationid = Number(realRegistrationId);
      const mapped = (payload.entryids || []).map((id) => {
        const idx = tempEntryIds.findIndex((tmp) => Number(tmp) === Number(id));
        return idx >= 0 ? Number(realEntryIds[idx]) : Number(id);
      });
      payload.entryids = mapped;
      await client.setEx(tokenKey, resolvedTtl, JSON.stringify(payload));
    }
  }

  const multi = client.multi();
  multi.del(tempRegKey);
  multi.setEx(
    REDIS_KEYS.resumeRegistration(realRegistrationId),
    resolvedTtl,
    JSON.stringify({ token, code })
  );
  if (codeKey && token) {
    multi.setEx(codeKey, resolvedTtl, token);
  }
  await multi.exec();
}

async function safeLen() {
  try {
    return await client.lLen(REDIS_KEYS.mysqlOutbox);
  } catch (_err) {
    return 0;
  }
}

module.exports = {
  enqueueCheckIn,
  enqueueStatusUpdate,
  enqueueAppendChildren,
  processOutbox,
};
