const { safeLog } = require('../../bus/hipaa/safeLog');
const { sendSMS, isConfigured } = require('./twilio');

const COMPLETED_MESSAGE =
  "Thank you for visiting The Children's Clinic of Fredericksburg. Your child's visit has been completed. We hope your child feels better soon. Please do not hesitate to contact us if you have any further concerns.";

function buildCompletedMessage() {
  return COMPLETED_MESSAGE;
}

async function notifyCompleted({ phone, sms_opt_in: smsOptIn }) {
  if (!smsOptIn) return;
  if (!isConfigured()) {
    safeLog.warn('Completed SMS skipped: Twilio not configured');
    return;
  }

  try {
    await sendSMS(phone, buildCompletedMessage());
    safeLog.info('Completed SMS sent');
  } catch (error) {
    safeLog.warn('Completed SMS failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

module.exports = { buildCompletedMessage, notifyCompleted };
