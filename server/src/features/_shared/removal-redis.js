const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');

async function remove(entryId, removedPosition) {
  await client.zRem(REDIS_KEYS.live, String(entryId));
  await client.del(REDIS_KEYS.entry(entryId));
  const members = await client.zRangeWithScores(REDIS_KEYS.live, 0, -1);
  const updates = [];
  for (const { value: id, score } of members) {
    if (Number(score) <= removedPosition) continue;
    const raw = await client.get(REDIS_KEYS.entry(id));
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    const newPosition = Number(score) - 1;
    parsed.position = newPosition;
    updates.push({ id, newPosition, parsed });
  }
  if (!updates.length) return;
  const multi = client.multi();
  for (const { id, newPosition, parsed } of updates) {
    multi.zAdd(REDIS_KEYS.live, { score: newPosition, value: id });
    multi.set(REDIS_KEYS.entry(id), JSON.stringify(parsed));
  }
  await multi.exec();
}

module.exports = { remove };
