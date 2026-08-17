const { safeLog } = require('../../bus/hipaa/safeLog');
const { sendSMS, isConfigured } = require('../waiting/twilio');

const POSITION_MESSAGES = {
  6: 'There are currently 5 patients ahead of your child in the queue at The Children\'s Clinic of Fredericksburg. We will continue to send you updates as your turn approaches.',
  4: 'There are currently 3 patients ahead of your child in the queue at The Children\'s Clinic of Fredericksburg. Please ensure you are on your way.',
  2: "Your child is next in the queue at The Children's Clinic of Fredericksburg. Please arrive at the clinic now so we can take you in promptly.",
  1: "It is now your child's turn at The Children's Clinic of Fredericksburg. Please proceed to the front desk immediately.",
};

function buildPositionMessage(position) {
  return POSITION_MESSAGES[Number(position)] ?? null;
}

async function sendPositionNotification(phone, position, smsOptIn) {
  if (!smsOptIn) return;

  const message = buildPositionMessage(position);
  if (!message) return;

  if (!isConfigured()) {
    safeLog.warn('Position SMS skipped: Twilio not configured');
    return;
  }

  try {
    await sendSMS(phone, message);
    safeLog.info('Position SMS sent');
  } catch (error) {
    safeLog.warn('Position SMS failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

module.exports = { buildPositionMessage, sendPositionNotification };
