const env = require('../../config/env');
const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');

async function getClinicHours() {
  const raw = await client.get(REDIS_KEYS.clinicHoursOverride);
  if (!raw) {
    return {
      hours: env.clinicHours,
      source: 'default',
    };
  }
  const parsed = JSON.parse(raw);
  return {
    hours: parsed.hours,
    source: 'override',
    override: parsed,
  };
}

async function setClinicHours(hours, staffName) {
  const trimmed = String(hours || '').trim();
  if (!trimmed) {
    const e = new Error('hours is required');
    e.status = 400;
    throw e;
  }

  const payload = {
    hours: trimmed,
    staff_name: staffName || 'Staff',
    set_at: new Date().toISOString(),
  };
  await client.set(REDIS_KEYS.clinicHoursOverride, JSON.stringify(payload));
  return {
    hours: payload.hours,
    source: 'override',
    override: payload,
  };
}

async function clearClinicHours() {
  await client.del(REDIS_KEYS.clinicHoursOverride);
  return getClinicHours();
}

module.exports = { getClinicHours, setClinicHours, clearClinicHours };
