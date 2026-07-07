const twilio = require('twilio');
const env = require('../../config/env');

let client;

function getClient() {
  const { accountSid, authToken } = env.twilio;
  if (!accountSid || !authToken) {
    throw new Error('Twilio not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
  }
  if (!client) client = twilio(accountSid, authToken);
  return client;
}

async function sendSMS(phone, body) {
  if (!env.twilio.from) throw new Error('TWILIO_FROM_NUMBER not set');
  return getClient().messages.create({
    to: phone,
    from: env.twilio.from,
    body,
  });
}

module.exports = { sendSMS };
