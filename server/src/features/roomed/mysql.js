const { query } = require('../../db/mysql');

async function apply(entryId, audit) {
  await query(
    `UPDATE queue_entry SET status = 'roomed', roomed = ? WHERE entryid = ?`,
    [JSON.stringify(audit), entryId]
  );
}

async function shift(removedPosition) {
  await query(
    `UPDATE queue_entry SET position = position - 1
     WHERE position > ? AND status IN ('waiting', 'arrived')`,
    [removedPosition]
  );
}

module.exports = { apply, shift };
