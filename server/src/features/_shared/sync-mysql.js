const { query } = require('../../db/mysql');
const { getActiveTimezone, getLocalDayUtcBounds } = require('../../utils/timezone');

async function liveEntries() {
  return query(
    `SELECT q.entryid, q.registrationid, q.fname, q.lname, q.symptoms, q.position, q.status, q.updated_at,
            r.parent_fname, r.parent_lname, r.checked_in_at
     FROM queue_entry q
     JOIN registration r ON r.registrationid = q.registrationid
     WHERE q.status IN ('waiting', 'arrived')
     ORDER BY q.position ASC, q.entryid ASC`
  );
}

async function roomedEntries(timezone) {
  const { start, end } = getLocalDayUtcBounds(timezone || getActiveTimezone());
  return query(
    `SELECT q.entryid, q.registrationid, q.fname, q.lname, q.symptoms, q.position, q.status, q.updated_at,
            r.parent_fname, r.parent_lname, r.checked_in_at
     FROM queue_entry q
     JOIN registration r ON r.registrationid = q.registrationid
     WHERE q.status = 'roomed'
       AND r.checked_in_at >= ?
       AND r.checked_in_at < ?
     ORDER BY q.updated_at ASC, q.entryid ASC`,
    [start, end]
  );
}

module.exports = { liveEntries, roomedEntries };
