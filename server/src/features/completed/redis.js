const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');

async function apply(entryId) {
  const raw = await client.get(REDIS_KEYS.entry(entryId));
  if (!raw) return null;
  const e = JSON.parse(raw);
  e.status = 'completed';
  await client.set(REDIS_KEYS.entry(entryId), JSON.stringify(e));
  return e;
}

module.exports = { apply };
