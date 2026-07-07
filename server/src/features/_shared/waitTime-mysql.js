const { query } = require('../../db/mysql');

async function recentRoomedTimestamps(limit = 5) {
  const rows = await query(
    `SELECT roomed FROM queue_entry
     WHERE roomed IS NOT NULL
       AND DATE(JSON_UNQUOTE(JSON_EXTRACT(roomed, '$.timestamp'))) = CURDATE()
     ORDER BY JSON_UNQUOTE(JSON_EXTRACT(roomed, '$.timestamp')) DESC
     LIMIT ?`,
    [limit]
  );
  return rows
    .map((r) => {
      const data = typeof r.roomed === 'string' ? JSON.parse(r.roomed) : r.roomed;
      return new Date(data.timestamp.replace('T', ' ')).getTime();
    })
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
}

module.exports = { recentRoomedTimestamps };
