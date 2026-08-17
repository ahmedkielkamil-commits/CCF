const { safeLog } = require('../../bus/hipaa/safeLog');
const { sendSMS, isConfigured } = require('./twilio');

const ARRIVED_MESSAGE =
  "This is a confirmation from The Children's Clinic of Fredericksburg. We have received your check-in and your child is now marked as arrived. Please ensure you are at the front desk so we can complete your check-in.";

function buildArrivedMessage() {
  return ARRIVED_MESSAGE;
}

async function notifyArrived({ phone, sms_opt_in: smsOptIn }) {
  if (!smsOptIn) return;
  if (!isConfigured()) {
    safeLog.warn('Arrived SMS skipped: Twilio not configured');
    return;
  }

  try {
    await sendSMS(phone, buildArrivedMessage());
    safeLog.info('Arrived SMS sent');
  } catch (error) {
    safeLog.warn('Arrived SMS failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

module.exports = { buildArrivedMessage, notifyArrived };
