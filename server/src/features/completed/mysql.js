const { query } = require('../../db/mysql');

async function apply(entryId, audit) {
  await query(
    `UPDATE queue_entry SET status = 'completed', completed = ? WHERE entryid = ?`,
    [JSON.stringify(audit), entryId]
  );
}

module.exports = { apply };
