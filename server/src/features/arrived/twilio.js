const twilio = require('twilio');
const env = require('../../config/env');

let client;

function isConfigured() {
  const { accountSid, authToken, from } = env.twilio;
  return Boolean(accountSid && authToken && from);
}

function getClient() {
  const { accountSid, authToken } = env.twilio;
  if (!accountSid || !authToken) {
    throw new Error('Twilio not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
  }
  if (!client) client = twilio(accountSid, authToken);
  return client;
}

function normalizePhoneForTwilio(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 10) return raw;
  if (digits.length > 0) return `+${digits}`;
  throw new Error('Invalid phone number');
}

async function sendSMS(phone, body) {
  if (!env.twilio.from) throw new Error('TWILIO_FROM_NUMBER not set');
  return getClient().messages.create({
    to: normalizePhoneForTwilio(phone),
    from: env.twilio.from,
    body,
  });
}

module.exports = { sendSMS, isConfigured, normalizePhoneForTwilio };
