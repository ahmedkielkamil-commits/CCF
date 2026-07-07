const { client } = require('../../db/redis');

const OVERRIDE_KEY = 'clinic:rooming_interval_override';

async function getOverride() {
  const raw = await client.get(OVERRIDE_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function setOverride(minutes, staffName) {
  const payload = {
    minutes: Number(minutes),
    staff_name: staffName || 'Staff',
    set_at: new Date().toISOString(),
  };
  await client.set(OVERRIDE_KEY, JSON.stringify(payload));
  return payload;
}

async function clearOverride() {
  await client.del(OVERRIDE_KEY);
}

module.exports = { getOverride, setOverride, clearOverride, OVERRIDE_KEY };
