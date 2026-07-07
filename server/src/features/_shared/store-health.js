const { client } = require('../../db/redis');
const { query } = require('../../db/mysql');

async function canUseRedis() {
  if (!client.isOpen) return false;
  try {
    await client.ping();
    return true;
  } catch (_err) {
    return false;
  }
}

async function canUseMysql() {
  try {
    await query('SELECT 1');
    return true;
  } catch (_err) {
    return false;
  }
}

function isTemporaryEntryId(entryId) {
  return Number(entryId) < 0;
}

function isTemporaryRegistrationId(registrationId) {
  return Number(registrationId) < 0;
}

module.exports = {
  canUseRedis,
  canUseMysql,
  isTemporaryEntryId,
  isTemporaryRegistrationId,
};
