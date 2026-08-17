const { client } = require('../../db/redis');
const { REDIS_KEYS } = require('../../constants');
const { normalizeTimestamp } = require('../../utils/datetime');

async function liveEntries() {
  const members = await client.zRangeWithScores(REDIS_KEYS.live, 0, -1);
  const entries = [];
  for (const { value: entryId, score: position } of members) {
    const raw = await client.get(REDIS_KEYS.entry(entryId));
    if (!raw) {
      entries.push({
        entryid: Number(entryId),
        position: Number(position),
        status: '(missing JSON)',
        fname: '',
        lname: '',
        registrationid: null,
        symptoms: '',
        checked_in_at: '',
      });
      continue;
    }
    const e = JSON.parse(raw);
    entries.push({
      entryid: e.entryid,
      registrationid: e.registrationid,
      fname: e.fname,
      lname: e.lname,
      symptoms: e.symptoms,
      checked_in_at: normalizeTimestamp(e.checked_in_at) || '',
      position: Number(position),
      status: e.status,
    });
  }
  return entries.sort((a, b) => a.position - b.position || a.entryid - b.entryid);
}

module.exports = { liveEntries };
