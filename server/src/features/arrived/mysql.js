const { query } = require('../../db/mysql');

async function apply(entryId, audit) {
  await query(
    `UPDATE queue_entry SET status = 'arrived', arrived = ? WHERE entryid = ?`,
    [JSON.stringify(audit), entryId]
  );
}

module.exports = { apply };
