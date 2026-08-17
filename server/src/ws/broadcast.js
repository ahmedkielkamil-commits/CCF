const { Server } = require('socket.io');
const env = require('../config/env');
const { client } = require('../db/redis');
const { query } = require('../db/mysql');
const { REDIS_KEYS } = require('../constants');
const { getEstimatedWait, getTime } = require('../features/_shared/waitTime');
const { liveEntries, roomedEntries } = require('../features/_shared/sync-mysql');
const { canUseRedis, canUseMysql } = require('../features/_shared/store-health');
const { formatDbDatetimeForApi, normalizeTimestamp } = require('../utils/datetime');

const { resolveTimezone, rememberClientTimezone } = require('../utils/timezone');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    const timezone = resolveTimezone(
      socket.handshake.auth?.timezone || socket.handshake.query?.timezone || socket.handshake.headers['x-client-timezone']
    );
    rememberClientTimezone(timezone);
    socket.data.clientTimezone = timezone;
    next();
  });

  return io;
}

function getIo() {
  return io;
}

async function buildQueuePayload() {
  if (!(await canUseRedis())) {
    return buildQueuePayloadFromMysql();
  }

  try {
    return await buildQueuePayloadFromRedis();
  } catch (_err) {
    return buildQueuePayloadFromMysql();
  }
}

async function buildQueuePayloadFromRedis() {
  const members = await client.zRangeWithScores(REDIS_KEYS.live, 0, -1);
  if (members.length === 0) {
    const mysqlRows = await liveEntries();
    if (mysqlRows.length > 0) return buildQueuePayloadFromMysql();
  }
  const interval = await getTime();
  const entries = [];

  for (const { value: entryId, score: position } of members) {
    const raw = await client.get(REDIS_KEYS.entry(entryId));
    if (!raw) continue;

    const entry = JSON.parse(raw);
    entries.push({
      entryid: entry.entryid,
      registrationid: entry.registrationid,
      fname: entry.fname,
      lname: entry.lname,
      symptoms: entry.symptoms,
      position: Number(position),
      status: entry.status,
    });
  }

  let parentByRegistration = new Map();
  if (entries.length > 0) {
    const registrationIds = [...new Set(entries.map((entry) => Number(entry.registrationid)))];
    const placeholders = registrationIds.map(() => '?').join(',');
    const rows = await query(
      `SELECT registrationid, parent_fname, parent_lname, checked_in_at
       FROM registration
       WHERE registrationid IN (${placeholders})`,
      registrationIds
    );
    parentByRegistration = new Map(
      rows.map((row) => [
        Number(row.registrationid),
        {
          parent_fname: row.parent_fname,
          parent_lname: row.parent_lname,
          checked_in_at: formatDbDatetimeForApi(row.checked_in_at),
        },
      ])
    );
  }

  const hydratedEntries = entries.map((entry) => {
    const parent = parentByRegistration.get(Number(entry.registrationid));
    const checkedInAt =
      parent?.checked_in_at || normalizeTimestamp(entry.checked_in_at) || '';
    return {
      ...entry,
      parent_fname: parent?.parent_fname ?? '',
      parent_lname: parent?.parent_lname ?? '',
      checked_in_at: checkedInAt,
      estimatedWait: getEstimatedWait(Number(entry.position), interval.minutes, checkedInAt),
    };
  });

  const inRoom = await buildInRoomPayload();

  return {
    entries: hydratedEntries,
    inRoom,
    roomingInterval: interval,
    updatedAt: new Date().toISOString(),
  };
}

async function buildMonitorPayload() {
  if (!(await canUseRedis())) {
    return buildMonitorPayloadFromMysql();
  }

  try {
    return await buildMonitorPayloadFromRedis();
  } catch (_err) {
    return buildMonitorPayloadFromMysql();
  }
}

function mapRoomedRow(row) {
  const checkedInAt = formatDbDatetimeForApi(row.checked_in_at);
  return {
    entryid: Number(row.entryid),
    registrationid: Number(row.registrationid),
    fname: row.fname,
    lname: row.lname,
    symptoms: row.symptoms,
    position: Number(row.position),
    status: row.status,
    parent_fname: row.parent_fname || '',
    parent_lname: row.parent_lname || '',
    checked_in_at: checkedInAt,
    estimatedWait: '—',
  };
}

async function buildInRoomPayload() {
  if (!(await canUseMysql())) return [];
  const rows = await roomedEntries();
  return rows.map(mapRoomedRow);
}

function patientInitials(fname, lname) {
  const first = String(fname || '').trim().charAt(0).toUpperCase();
  const last = String(lname || '').trim().charAt(0).toUpperCase();
  if (!first && !last) return '—';
  return `${first}${last}`;
}

async function buildMonitorPayloadFromRedis() {
  const members = await client.zRangeWithScores(REDIS_KEYS.live, 0, -1);
  if (members.length === 0) {
    const mysqlRows = await liveEntries();
    if (mysqlRows.length > 0) return buildMonitorPayloadFromMysql();
  }
  const interval = await getTime();
  const entries = [];

  for (const { value: entryId, score: position } of members) {
    const raw = await client.get(REDIS_KEYS.entry(entryId));
    if (!raw) continue;

    const entry = JSON.parse(raw);
    entries.push({
      entryid: entry.entryid,
      registrationid: entry.registrationid,
      fname: entry.fname,
      lname: entry.lname,
      ticket: `#${entry.entryid}`,
      position: Number(position),
      status: entry.status,
    });
  }

  let checkedInByRegistration = new Map();
  if (entries.length > 0) {
    const registrationIds = [...new Set(entries.map((entry) => Number(entry.registrationid)))];
    const placeholders = registrationIds.map(() => '?').join(',');
    const rows = await query(
      `SELECT registrationid, checked_in_at
       FROM registration
       WHERE registrationid IN (${placeholders})`,
      registrationIds
    );
    checkedInByRegistration = new Map(
      rows.map((row) => [
        Number(row.registrationid),
        formatDbDatetimeForApi(row.checked_in_at),
      ])
    );
  }

  const hydratedEntries = entries.map((entry) => ({
    entryid: entry.entryid,
    ticket: entry.ticket,
    initials: patientInitials(entry.fname, entry.lname),
    position: entry.position,
    status: entry.status,
    estimatedWait: getEstimatedWait(
      Number(entry.position),
      interval.minutes,
      checkedInByRegistration.get(Number(entry.registrationid))
    ),
  }));

  return {
    entries: hydratedEntries,
    roomingInterval: interval,
    updatedAt: new Date().toISOString(),
  };
}

async function buildQueuePayloadFromMysql() {
  const [rows, interval, inRoom] = await Promise.all([liveEntries(), getTime(), buildInRoomPayload()]);
  const entries = rows.map((row) => {
    const checkedInAt = formatDbDatetimeForApi(row.checked_in_at);
    return {
      entryid: Number(row.entryid),
      registrationid: Number(row.registrationid),
      fname: row.fname,
      lname: row.lname,
      symptoms: row.symptoms,
      position: Number(row.position),
      status: row.status,
      parent_fname: row.parent_fname || '',
      parent_lname: row.parent_lname || '',
      checked_in_at: checkedInAt,
      estimatedWait: getEstimatedWait(Number(row.position), interval.minutes, checkedInAt),
    };
  });
  return {
    entries,
    inRoom,
    roomingInterval: interval,
    updatedAt: new Date().toISOString(),
  };
}

async function buildMonitorPayloadFromMysql() {
  const [rows, interval] = await Promise.all([liveEntries(), getTime()]);
  const entries = rows.map((row) => {
    const checkedInAt = formatDbDatetimeForApi(row.checked_in_at);
    return {
      entryid: Number(row.entryid),
      ticket: `#${row.entryid}`,
      initials: patientInitials(row.fname, row.lname),
      position: Number(row.position),
      status: row.status,
      estimatedWait: getEstimatedWait(Number(row.position), interval.minutes, checkedInAt),
    };
  });
  return {
    entries,
    roomingInterval: interval,
    updatedAt: new Date().toISOString(),
  };
}

async function recalcAndBroadcast() {
  if (!io) return;
  const [queuePayload, monitorPayload] = await Promise.all([buildQueuePayload(), buildMonitorPayload()]);
  io.emit('queue:update', queuePayload);
  io.emit('monitor:update', monitorPayload);
  return queuePayload;
}

module.exports = { initSocket, getIo, buildQueuePayload, buildMonitorPayload, recalcAndBroadcast };
