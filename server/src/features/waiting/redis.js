const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');
const { normalizeRedisEntry } = require('../../utils/datetime');

async function reserve(n) {
  const r = await client.zRangeWithScores(REDIS_KEYS.live, -1, -1);
  const max = r.length ? Number(r[0].score) : 0;
  return Array.from({ length: n }, (_, i) => max + i + 1);
}

async function add(entries) {
  const m = client.multi();
  for (const entry of entries) {
    const e = normalizeRedisEntry(entry);
    m.zAdd(REDIS_KEYS.live, { score: e.position, value: String(e.entryid) });
    m.set(REDIS_KEYS.entry(e.entryid), JSON.stringify(e));
  }
  await m.exec();
}

module.exports = { reserve, add };
