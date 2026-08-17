const { query } = require('../../db/mysql');

async function loadRegistrationContacts(registrationIds) {
  const ids = [...new Set(registrationIds.map(Number).filter((id) => id > 0))];
  if (!ids.length) return new Map();

  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query(
      `SELECT registrationid, phone, sms_opt_in
       FROM registration
       WHERE registrationid IN (${placeholders})`,
      ids
    );
    return new Map(
      rows.map((row) => [
        Number(row.registrationid),
        {
          phone: row.phone,
          sms_opt_in: Boolean(row.sms_opt_in),
        },
      ])
    );
  } catch (_err) {
    return new Map();
  }
}

async function loadRegistrationContact(registrationId) {
  const contacts = await loadRegistrationContacts([registrationId]);
  return contacts.get(Number(registrationId)) ?? null;
}

module.exports = { loadRegistrationContact, loadRegistrationContacts };
