const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');
const { query } = require('../../db/mysql');

async function load(entryId) {
  try {
    if (client.isOpen) {
      const raw = await client.get(REDIS_KEYS.entry(entryId));
      if (raw) return JSON.parse(raw);
    }
  } catch (_err) {
    // Fall through to MySQL when Redis is unavailable.
  }

  const rows = await query(
    `SELECT q.entryid, q.registrationid, q.fname, q.lname, q.symptoms, q.position, q.status, r.checked_in_at
     FROM queue_entry q
     JOIN registration r ON r.registrationid = q.registrationid
     WHERE q.entryid = ?
     LIMIT 1`,
    [entryId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    entryid: Number(row.entryid),
    registrationid: Number(row.registrationid),
    fname: row.fname,
    lname: row.lname,
    symptoms: row.symptoms,
    position: Number(row.position),
    status: row.status,
    checked_in_at:
      row.checked_in_at instanceof Date ? row.checked_in_at.toISOString() : String(row.checked_in_at || ''),
  };
}

function notFound() {
  const e = new Error('Queue entry not found');
  e.status = 404;
  return e;
}

module.exports = { load, notFound };
