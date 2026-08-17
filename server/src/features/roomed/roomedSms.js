const { safeLog } = require('../../bus/hipaa/safeLog');
const { sendSMS, isConfigured } = require('./twilio');

const ROOMED_MESSAGE =
  "A staff member at The Children's Clinic of Fredericksburg is ready for your child. Please make your way to the front desk now.";

function buildRoomedMessage() {
  return ROOMED_MESSAGE;
}

async function notifyRoomed({ phone, sms_opt_in: smsOptIn }) {
  if (!smsOptIn) return;
  if (!isConfigured()) {
    safeLog.warn('Roomed SMS skipped: Twilio not configured');
    return;
  }

  try {
    await sendSMS(phone, buildRoomedMessage());
    safeLog.info('Roomed SMS sent');
  } catch (error) {
    safeLog.warn('Roomed SMS failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

module.exports = { buildRoomedMessage, notifyRoomed };
