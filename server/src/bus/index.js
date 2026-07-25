const express = require('express');
const { STATUSES } = require('../constants');
const { buildQueuePayload, buildMonitorPayload, recalcAndBroadcast } = require('../ws/broadcast');
const { load, notFound } = require('../features/_shared/entry');
const { getTime, setTime, clearTime } = require('../features/_shared/waitTime');
const { getClinicHours, setClinicHours, clearClinicHours } = require('../features/_shared/clinicHours');
const { query } = require('../db/mysql');
const { getEstimatedWait } = require('../features/_shared/waitTime');
const { getSyncReport } = require('../features/_shared/sync');
const { getUsageReport } = require('../features/_shared/usage-analytics');
const { client } = require('../db/redis');
const { REDIS_KEYS } = require('../constants');
const {
  canUseMysql,
  canUseRedis,
  isTemporaryEntryId,
  isTemporaryRegistrationId,
} = require('../features/_shared/store-health');
const {
  enqueueCheckIn,
  enqueueStatusUpdate,
  enqueueAppendChildren,
  processOutbox,
} = require('../features/_shared/mysql-outbox');
const {
  issueResumeToken,
  addEntriesToResumeToken,
  getResumeSession,
  getResumeSessionByCode,
  cleanupIfRegistrationNotLive,
  formatDisplayCode,
  parseResumeCodeInput,
} = require('../features/_shared/resume-token');
const { buildAuditRecord } = require('../utils/audit');
const { safeLog } = require('./hipaa/safeLog');
const staffIpAllowlist = require('./hipaa/staffIpAllowlist');

const waitingRedis = require('../features/waiting/redis');
const waitingMysql = require('../features/waiting/mysql');
const arrivedRedis = require('../features/arrived/redis');
const arrivedMysql = require('../features/arrived/mysql');
const roomedRedis = require('../features/roomed/redis');
const roomedMysql = require('../features/roomed/mysql');
const completedRedis = require('../features/completed/redis');
const completedMysql = require('../features/completed/mysql');
const noShowRedis = require('../features/no_show/redis');
const noShowMysql = require('../features/no_show/mysql');
const { notifyQueueJoined } = require('../features/waiting/queueJoinSms');

const router = express.Router();
const DEFAULT_QUEUE_MAX_ACTIVE = 50;
const queueMaxActive = Number(process.env.QUEUE_MAX_ACTIVE || DEFAULT_QUEUE_MAX_ACTIVE);

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCheckIn(body) {
  const err = [];
  if (!hasNonEmptyString(body?.parent_fname)) err.push('parent_fname is required');
  if (!hasNonEmptyString(body?.parent_lname)) err.push('parent_lname is required');
  if (!hasNonEmptyString(body?.phone)) err.push('phone is required');
  if (!Array.isArray(body?.children) || !body.children.length) err.push('at least one child is required');
  else body.children.forEach((c, i) => {
    if (!hasNonEmptyString(c?.fname)) err.push(`children[${i}].fname is required`);
    if (!hasNonEmptyString(c?.lname)) err.push(`children[${i}].lname is required`);
    if (!hasNonEmptyString(c?.symptoms)) err.push(`children[${i}].symptoms is required`);
  });
  if (err.length) {
    const e = new Error('Validation failed');
    e.status = 400;
    e.details = err;
    throw e;
  }
}

function requireStaff(staffName) {
  if (!staffName?.trim()) {
    const e = new Error('staff_name is required');
    e.status = 400;
    throw e;
  }
  return staffName.trim();
}

function normalizeCheckInBody(body) {
  return {
    parent_fname: hasNonEmptyString(body.parent_fname) ? body.parent_fname.trim() : '',
    parent_lname: hasNonEmptyString(body.parent_lname) ? body.parent_lname.trim() : '',
    phone: hasNonEmptyString(body.phone) ? body.phone.trim() : '',
    additional_notes: hasNonEmptyString(body.additional_notes) ? body.additional_notes.trim() : null,
    sms_opt_in: Boolean(body.sms_opt_in),
    children: (body.children || []).map((child) => ({
      fname: hasNonEmptyString(child?.fname) ? child.fname.trim() : '',
      lname: hasNonEmptyString(child?.lname) ? child.lname.trim() : '',
      symptoms: hasNonEmptyString(child?.symptoms) ? child.symptoms.trim() : '',
    })),
  };
}

async function assertQueueCapacity(incomingCount) {
  if (!Number.isFinite(queueMaxActive) || queueMaxActive <= 0) return;
  const queue = await buildQueuePayload();
  const activeCount = Array.isArray(queue?.entries) ? queue.entries.length : 0;
  if (activeCount + Number(incomingCount || 0) > queueMaxActive) {
    const e = new Error('Queue at capacity');
    e.status = 429;
    e.code = 'QUEUE_FULL';
    e.max = queueMaxActive;
    e.current = activeCount;
    throw e;
  }
}

async function checkIn(body) {
  validateCheckIn(body);
  const payload = normalizeCheckInBody(body);

  await processOutbox();
  const redisUp = await canUseRedis();
  const mysqlUp = await canUseMysql();

  if (!redisUp && !mysqlUp) {
    const err = new Error('Queue is temporarily unavailable');
    err.status = 503;
    throw err;
  }

  if (mysqlUp && !redisUp) {
    const err = new Error('Queue check-in is temporarily unavailable. Please try again shortly.');
    err.status = 503;
    throw err;
  }

  if (!mysqlUp && redisUp) {
    await assertQueueCapacity(payload.children.length);
    const checkedInAt = new Date().toISOString();
    const positions = await waitingRedis.reserve(payload.children.length);
    const tempRegistrationId = -Number(await client.incr(REDIS_KEYS.tempRegistrationSeq));
    const tempEntryIds = [];
    for (let i = 0; i < payload.children.length; i++) {
      tempEntryIds.push(-Number(await client.incr(REDIS_KEYS.tempEntrySeq)));
    }

    const entries = payload.children.map((child, index) => ({
      entryid: tempEntryIds[index],
      registrationid: tempRegistrationId,
      parent_fname: payload.parent_fname,
      parent_lname: payload.parent_lname,
      fname: child.fname,
      lname: child.lname,
      symptoms: child.symptoms,
      checked_in_at: checkedInAt,
      position: positions[index],
      status: 'waiting',
    }));

    await waitingRedis.add(entries);
    await enqueueCheckIn({
      tempRegistrationId,
      tempEntryIds,
      checkedInAt,
      positions,
      body: payload,
    });

    const queue = await recalcAndBroadcast();
    const resume = await issueResumeToken(tempRegistrationId, tempEntryIds, {
      parentFname: payload.parent_fname,
      parentLname: payload.parent_lname,
    });
    const resultEntries = entries.map((e) => ({ entryid: e.entryid, position: e.position, status: e.status }));
    notifyQueueJoined({
      body: payload,
      entries: resultEntries,
      resumeCode: resume.code,
    }).catch(() => undefined);
    return {
      registrationid: tempRegistrationId,
      resumeToken: resume.token,
      resumeCode: resume.code,
      entries: resultEntries,
      queue,
      sync: { mode: 'redis_outbox', pending: true },
    };
  }

  await assertQueueCapacity(payload.children.length);
  const positions = await waitingRedis.reserve(payload.children.length);
  const { registrationid, entries } = await waitingMysql.insert(payload, positions);
  try {
    const redisEntries = entries.map((entry) => ({
      ...entry,
      parent_fname: payload.parent_fname,
      parent_lname: payload.parent_lname,
    }));
    await waitingRedis.add(redisEntries);
  } catch (e) {
    safeLog.error('Redis write failed after MySQL commit', {
      registrationid,
      entryids: entries.map((x) => x.entryid),
      message: e.message,
    });
  }
  const queue = await recalcAndBroadcast();
  let resume = { token: null, code: null };
  try {
    resume = await issueResumeToken(
      registrationid,
      entries.map((entry) => entry.entryid),
      {
        parentFname: payload.parent_fname,
        parentLname: payload.parent_lname,
      }
    );
  } catch (_err) {
    // Resume token requires Redis; keep check-in successful without it.
  }
  const resultEntries = entries.map((e) => ({ entryid: e.entryid, position: e.position, status: e.status }));
  notifyQueueJoined({
    body: payload,
    entries: resultEntries,
    resumeCode: resume.code,
  }).catch(() => undefined);
  return {
    registrationid,
    resumeToken: resume.token,
    resumeCode: resume.code,
    entries: resultEntries,
    queue,
    sync: { mode: 'healthy' },
  };
}

function normalizeChildren(children) {
  return (Array.isArray(children) ? children : []).map((child) => ({
    fname: hasNonEmptyString(child?.fname) ? child.fname.trim() : '',
    lname: hasNonEmptyString(child?.lname) ? child.lname.trim() : '',
    symptoms: hasNonEmptyString(child?.symptoms) ? child.symptoms.trim() : '',
  }));
}

function validateChildren(children) {
  const err = [];
  if (!Array.isArray(children) || !children.length) {
    err.push('at least one child is required');
  } else {
    children.forEach((c, i) => {
      if (!hasNonEmptyString(c?.fname)) err.push(`children[${i}].fname is required`);
      if (!hasNonEmptyString(c?.lname)) err.push(`children[${i}].lname is required`);
      if (!hasNonEmptyString(c?.symptoms)) err.push(`children[${i}].symptoms is required`);
    });
  }
  if (err.length) {
    const e = new Error('Validation failed');
    e.status = 400;
    e.details = err;
    throw e;
  }
}

async function assertRegistrationActive(registrationId) {
  const queue = await buildQueuePayload();
  const active = (queue.entries || []).some(
    (entry) =>
      Number(entry.registrationid) === Number(registrationId) &&
      (entry.status === 'waiting' || entry.status === 'arrived')
  );
  if (!active) {
    const e = new Error('This check-in is no longer active. Please start a new check-in.');
    e.status = 409;
    e.code = 'REGISTRATION_INACTIVE';
    throw e;
  }
}

async function addChildren(tokenOrCode, body) {
  const children = normalizeChildren(body?.children);
  validateChildren(children);

  await processOutbox();
  const redisUp = await canUseRedis();

  // The live queue, resume-session lookup, and queued writes all require Redis.
  if (!redisUp) {
    const err = new Error('Adding to your check-in is temporarily unavailable. Please try again shortly.');
    err.status = 503;
    throw err;
  }

  const session = await resolveResumeSession(tokenOrCode);
  if (!session?.registrationid) {
    const e = new Error('Resume token expired or invalid');
    e.status = 404;
    throw e;
  }
  const registrationid = Number(session.registrationid);

  // Rule: only append while the registration still has live entries in the queue.
  await assertRegistrationActive(registrationid);
  await assertQueueCapacity(children.length);

  const positions = await waitingRedis.reserve(children.length);
  const mysqlUp = await canUseMysql();

  if (!mysqlUp) {
    const checkedInAt = new Date().toISOString();
    const queueSnapshot = await buildQueuePayload();
    const sibling = (queueSnapshot.entries || []).find(
      (entry) => Number(entry.registrationid) === registrationid
    );
    const parentFname = sibling?.parent_fname || '';
    const parentLname = sibling?.parent_lname || '';

    const tempEntryIds = [];
    for (let i = 0; i < children.length; i++) {
      tempEntryIds.push(-Number(await client.incr(REDIS_KEYS.tempEntrySeq)));
    }

    const entries = children.map((child, index) => ({
      entryid: tempEntryIds[index],
      registrationid,
      parent_fname: parentFname,
      parent_lname: parentLname,
      fname: child.fname,
      lname: child.lname,
      symptoms: child.symptoms,
      checked_in_at: checkedInAt,
      position: positions[index],
      status: 'waiting',
    }));

    await waitingRedis.add(entries);
    await enqueueAppendChildren({
      registrationid,
      tempEntryIds,
      checkedInAt,
      positions,
      children,
    });
    try {
      await addEntriesToResumeToken(registrationid, tempEntryIds);
    } catch (_err) {
      // Non-fatal: resume token entry list is informational.
    }

    const queue = await recalcAndBroadcast();
    return {
      registrationid,
      resumeToken: session.token,
      resumeCode: formatDisplayCode(session.code, session.initials),
      entries: entries.map((e) => ({ entryid: e.entryid, position: e.position, status: e.status })),
      queue,
      sync: { mode: 'redis_outbox', pending: true },
    };
  }

  if (isTemporaryRegistrationId(registrationid)) {
    const e = new Error('Your check-in is still syncing; please try again shortly.');
    e.status = 503;
    throw e;
  }

  const { entries } = await waitingMysql.appendChildren(registrationid, children, positions);
  try {
    await waitingRedis.add(entries);
  } catch (e) {
    safeLog.error('Redis write failed after MySQL append', {
      registrationid,
      entryids: entries.map((x) => x.entryid),
      message: e.message,
    });
  }
  try {
    await addEntriesToResumeToken(
      registrationid,
      entries.map((entry) => entry.entryid)
    );
  } catch (_err) {
    // Non-fatal: resume token entry list is informational.
  }

  const queue = await recalcAndBroadcast();
  return {
    registrationid,
    resumeToken: session.token,
    resumeCode: formatDisplayCode(session.code, session.initials),
    entries: entries.map((e) => ({ entryid: e.entryid, position: e.position, status: e.status })),
    queue,
    sync: { mode: 'healthy' },
  };
}

async function buildResumeResponse(registrationId, resumeToken, resumeLookupCode, initials) {
  const queue = await buildQueuePayload();
  let rows = [];
  if (await canUseMysql()) {
    rows = await query(
      `SELECT q.entryid, q.fname, q.lname, q.symptoms, q.status, q.position, r.checked_in_at
       FROM queue_entry q
       JOIN registration r ON r.registrationid = q.registrationid
       WHERE q.registrationid = ?
       ORDER BY q.entryid ASC`,
      [registrationId]
    );
  } else {
    rows = queue.entries
      .filter((entry) => Number(entry.registrationid) === Number(registrationId))
      .map((entry) => ({
        entryid: entry.entryid,
        fname: entry.fname,
        lname: entry.lname,
        symptoms: entry.symptoms,
        status: entry.status,
        position: entry.position,
        checked_in_at: entry.checked_in_at || '',
      }));
  }

  if (!rows.length) {
    const e = new Error('Registration not found');
    e.status = 404;
    throw e;
  }

  const intervalMinutes = Number(queue.roomingInterval?.minutes || 15);
  const liveByEntry = new Map(queue.entries.map((entry) => [Number(entry.entryid), entry]));

  const entries = rows.map((row) => {
    const live = liveByEntry.get(Number(row.entryid));
    return {
      entryid: Number(row.entryid),
      fname: row.fname,
      lname: row.lname,
      symptoms: row.symptoms,
      position: Number(live?.position ?? row.position),
      status: live?.status ?? row.status,
      estimatedWait:
        live?.estimatedWait ??
        (row.status === 'waiting' || row.status === 'arrived'
          ? getEstimatedWait(Number(row.position), intervalMinutes, row.checked_in_at)
          : '—'),
    };
  });

  return {
    registrationid: Number(registrationId),
    resumeToken,
    resumeCode: formatDisplayCode(resumeLookupCode, initials),
    entries,
  };
}

async function resolveResumeSession(tokenOrCode) {
  const raw = String(tokenOrCode || '').trim();
  if (!raw) return null;
  if (parseResumeCodeInput(raw)) {
    return getResumeSessionByCode(raw);
  }
  if (/^[A-Za-z0-9_-]{30,}$/.test(raw)) {
    return getResumeSession(raw);
  }
  return null;
}

async function applyArrived(entryId, staffName, req) {
  await processOutbox();
  const prev = await load(entryId);
  if (!prev) throw notFound();
  if (isTemporaryEntryId(prev.entryid)) {
    const e = new Error('Entry is pending MySQL sync; try again shortly');
    e.status = 503;
    throw e;
  }
  const audit = buildAuditRecord({
    previousStatus: prev.status,
    newStatus: 'arrived',
    staffName: (staffName || 'Patient').trim(),
    req,
  });
  const mysqlUp = await canUseMysql();
  if (mysqlUp) {
    await arrivedMysql.apply(entryId, audit);
  } else {
    await enqueueStatusUpdate({ status: 'arrived', entryId: Number(entryId), audit });
  }
  try {
    if (await canUseRedis()) await arrivedRedis.apply(entryId);
  } catch (_err) {
    // MySQL remains source of truth for this path.
  }
  const queue = await recalcAndBroadcast();
  return { entryid: Number(entryId), status: 'arrived', queue };
}

async function applyCompleted(entryId, staffName, req) {
  await processOutbox();
  const prev = await load(entryId);
  if (!prev) throw notFound();
  if (isTemporaryEntryId(prev.entryid)) {
    const e = new Error('Entry is pending MySQL sync; try again shortly');
    e.status = 503;
    throw e;
  }
  const audit = buildAuditRecord({
    previousStatus: prev.status,
    newStatus: 'completed',
    staffName: requireStaff(staffName),
    req,
  });
  const mysqlUp = await canUseMysql();
  if (mysqlUp) {
    await completedMysql.apply(entryId, audit);
  } else {
    await enqueueStatusUpdate({ status: 'completed', entryId: Number(entryId), audit });
  }
  try {
    if (await canUseRedis()) await completedRedis.apply(entryId);
  } catch (_err) {
    // MySQL remains source of truth for this path.
  }
  const queue = await recalcAndBroadcast();
  return { entryid: Number(entryId), status: 'completed', queue };
}

async function applyRoomed(entryId, staffName, req) {
  await processOutbox();
  const prev = await load(entryId);
  if (!prev) throw notFound();
  if (isTemporaryEntryId(prev.entryid)) {
    const e = new Error('Entry is pending MySQL sync; try again shortly');
    e.status = 503;
    throw e;
  }
  const audit = buildAuditRecord({
    previousStatus: prev.status,
    newStatus: 'roomed',
    staffName: requireStaff(staffName),
    req,
  });
  const mysqlUp = await canUseMysql();
  if (mysqlUp) {
    await roomedMysql.apply(entryId, audit);
    await roomedMysql.shift(prev.position);
  } else {
    await enqueueStatusUpdate({
      status: 'roomed',
      entryId: Number(entryId),
      removedPosition: Number(prev.position),
      audit,
    });
  }
  try {
    if (await canUseRedis()) {
      await roomedRedis.remove(entryId, prev.position);
      await cleanupIfRegistrationNotLive(prev.registrationid);
    }
  } catch (_err) {
    // MySQL remains source of truth for this path.
  }
  const queue = await recalcAndBroadcast();
  return { entryid: Number(entryId), status: 'roomed', queue };
}

async function applyNoShow(entryId, staffName, req) {
  await processOutbox();
  const prev = await load(entryId);
  if (!prev) throw notFound();
  if (isTemporaryEntryId(prev.entryid)) {
    const e = new Error('Entry is pending MySQL sync; try again shortly');
    e.status = 503;
    throw e;
  }
  const audit = buildAuditRecord({
    previousStatus: prev.status,
    newStatus: 'no_show',
    staffName: requireStaff(staffName),
    req,
  });
  const mysqlUp = await canUseMysql();
  if (mysqlUp) {
    await noShowMysql.apply(entryId, audit);
    await noShowMysql.shift(prev.position);
  } else {
    await enqueueStatusUpdate({
      status: 'no_show',
      entryId: Number(entryId),
      removedPosition: Number(prev.position),
      audit,
    });
  }
  try {
    if (await canUseRedis()) {
      await noShowRedis.remove(entryId, prev.position);
      await cleanupIfRegistrationNotLive(prev.registrationid);
    }
  } catch (_err) {
    // MySQL remains source of truth for this path.
  }
  const queue = await recalcAndBroadcast();
  return { entryid: Number(entryId), status: 'no_show', queue };
}

const handlers = {
  arrived: applyArrived,
  roomed: applyRoomed,
  completed: applyCompleted,
  no_show: applyNoShow,
};

router.__testables = {
  validateCheckIn,
  checkIn,
  addChildren,
  assertRegistrationActive,
  buildResumeResponse,
  resolveResumeSession,
  applyArrived,
  applyCompleted,
  applyRoomed,
  applyNoShow,
};

// ─── Public routes (no IP restriction) ────────────────────────────────────────

router.get('/queue', async (_req, res, next) => {
  try {
    res.json(await buildQueuePayload());
  } catch (err) {
    next(err);
  }
});

router.get('/monitor/queue', staffIpAllowlist, async (_req, res, next) => {
  try {
    res.json(await buildMonitorPayload());
  } catch (err) {
    next(err);
  }
});

router.post('/check-in', async (req, res, next) => {
  try {
    res.status(201).json(await checkIn(req.body));
  } catch (err) {
    next(err);
  }
});

router.post('/parent/add-children/:tokenOrCode', async (req, res, next) => {
  try {
    res.status(201).json(await addChildren(req.params.tokenOrCode, req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/parent/resume/:tokenOrCode', async (req, res, next) => {
  try {
    const session = await resolveResumeSession(req.params.tokenOrCode);
    if (!session?.registrationid) {
      const e = new Error('Resume token expired or invalid');
      e.status = 404;
      throw e;
    }

    res.json(
      await buildResumeResponse(
        session.registrationid,
        session.token,
        session.code,
        session.initials
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/parent/cancel/:tokenOrCode', async (req, res, next) => {
  try {
    const session = await resolveResumeSession(req.params.tokenOrCode);
    if (!session?.registrationid) {
      const e = new Error('Resume token expired or invalid');
      e.status = 404;
      throw e;
    }

    const mysqlUp = await canUseMysql();
    const rows = mysqlUp
      ? await query(
        `SELECT entryid
         FROM queue_entry
         WHERE registrationid = ?
           AND status IN ('waiting', 'arrived')
         ORDER BY position DESC, entryid DESC`,
        [session.registrationid]
      )
      : (await buildQueuePayload())
        .entries
        .filter(
          (entry) =>
            Number(entry.registrationid) === Number(session.registrationid) &&
            (entry.status === 'waiting' || entry.status === 'arrived')
        )
        .sort((a, b) => b.position - a.position || b.entryid - a.entryid)
        .map((entry) => ({ entryid: entry.entryid }));

    let cancelledCount = 0;
    for (const row of rows) {
      const prev = await load(row.entryid);
      if (!prev) continue;
      const audit = buildAuditRecord({
        previousStatus: prev.status,
        newStatus: 'no_show',
        staffName: 'Parent Cancel',
        req,
      });
      if (mysqlUp) {
        await noShowMysql.apply(row.entryid, audit);
        await noShowMysql.shift(prev.position);
      } else {
        await enqueueStatusUpdate({
          status: 'no_show',
          entryId: Number(row.entryid),
          removedPosition: Number(prev.position),
          audit,
        });
      }
      try {
        if (await canUseRedis()) {
          await noShowRedis.remove(row.entryid, prev.position);
        }
      } catch (error) {
        safeLog.warn('Parent cancel Redis removal failed; continuing in degraded mode', {
          entryid: Number(row.entryid),
          message: error instanceof Error ? error.message : 'unknown error',
        });
      }
      cancelledCount += 1;
    }

    try {
      if (await canUseRedis()) {
        await cleanupIfRegistrationNotLive(session.registrationid);
      }
    } catch (_err) {
      // Non-fatal cleanup failure in degraded mode.
    }
    const queue = await recalcAndBroadcast();
    res.json({
      registrationid: Number(session.registrationid),
      cancelledCount,
      queue,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/clinic/wait-interval', async (_req, res, next) => {
  try {
    res.json(await getTime());
  } catch (err) {
    next(err);
  }
});

router.get('/clinic/hours', async (_req, res, next) => {
  try {
    res.json(await getClinicHours());
  } catch (err) {
    next(err);
  }
});

// ─── Staff-only routes (IP-restricted) ────────────────────────────────────────

router.get('/sync', staffIpAllowlist, async (_req, res, next) => {
  try {
    res.json(await getSyncReport());
  } catch (err) {
    next(err);
  }
});

router.get('/reports/usage', staffIpAllowlist, async (req, res, next) => {
  try {
    const days = req.query.days;
    res.json(await getUsageReport({ days }));
  } catch (err) {
    next(err);
  }
});

router.put('/clinic/wait-interval', staffIpAllowlist, async (req, res, next) => {
  try {
    const { minutes, staff_name: staffName } = req.body;
    requireStaff(staffName);
    res.json(await setTime(minutes, staffName));
  } catch (err) {
    next(err);
  }
});

router.put('/clinic/hours', staffIpAllowlist, async (req, res, next) => {
  try {
    const { hours, staff_name: staffName } = req.body;
    requireStaff(staffName);
    res.json(await setClinicHours(hours, staffName));
  } catch (err) {
    next(err);
  }
});

router.delete('/clinic/wait-interval', staffIpAllowlist, async (_req, res, next) => {
  try {
    res.json(await clearTime());
  } catch (err) {
    next(err);
  }
});

router.delete('/clinic/hours', staffIpAllowlist, async (_req, res, next) => {
  try {
    res.json(await clearClinicHours());
  } catch (err) {
    next(err);
  }
});

router.patch('/queue/:entryId', staffIpAllowlist, async (req, res, next) => {
  try {
    const { status, staff_name: staffName } = req.body;
    if (!STATUSES.includes(status) || status === 'waiting') {
      const e = new Error(`Invalid status. Use one of: ${STATUSES.filter((s) => s !== 'waiting').join(', ')}`);
      e.status = 400;
      throw e;
    }
    const handler = handlers[status];
    res.json(await handler(req.params.entryId, staffName, req));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
