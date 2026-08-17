const { query } = require('../../db/mysql');
const { getActiveTimezone, getLocalDayUtcBounds } = require('../../utils/timezone');

function parseRoomedTimestamp(roomed) {
  const data = typeof roomed === 'string' ? JSON.parse(roomed) : roomed;
  const raw = String(data?.timestamp || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function recentRoomedTimestamps(limit = 5, timezone) {
  const { start, end } = getLocalDayUtcBounds(timezone || getActiveTimezone());
  const rows = await query(
    `SELECT roomed FROM queue_entry
     WHERE roomed IS NOT NULL
     ORDER BY JSON_UNQUOTE(JSON_EXTRACT(roomed, '$.timestamp')) DESC
     LIMIT ?`,
    [Math.max(limit * 4, limit)]
  );

  return rows
    .map((row) => parseRoomedTimestamp(row.roomed))
    .filter((timestamp) => timestamp && timestamp >= start && timestamp < end)
    .map((timestamp) => timestamp.getTime())
    .sort((a, b) => a - b)
    .slice(-limit);
}

module.exports = { recentRoomedTimestamps };
