const { formatDisplayCode, parentInitials } = require('../_shared/resume-token');
const { safeLog } = require('../../bus/hipaa/safeLog');
const { sendSMS, isConfigured } = require('./twilio');

const CLINIC_NAME = "The Children's Clinic of Fredericksburg";

function childNames(children) {
  const names = children.map((child) => child.fname).filter(Boolean);
  if (names.length <= 1) return names[0] || 'Your child';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function positionLabel(entries) {
  const positions = entries
    .map((entry) => Number(entry.position))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!positions.length) return 'the queue';
  if (positions.length === 1) return `position ${positions[0]}`;
  return `positions ${positions[0]}-${positions[positions.length - 1]}`;
}

function buildQueueJoinMessage({ body, entries, resumeCode }) {
  const names = childNames(body.children);
  const verb = body.children.length === 1 ? 'has' : 'have';
  const displayCode = formatDisplayCode(resumeCode, parentInitials(body.parent_fname, body.parent_lname));
  const codePart = displayCode ? ` Access code: ${displayCode}.` : '';
  return `Hi ${body.parent_fname}, ${names} ${verb} been added to the walk-in queue (${positionLabel(entries)}).${codePart} ${CLINIC_NAME}`;
}

async function notifyQueueJoined({ body, entries, resumeCode }) {
  if (!body?.sms_opt_in) return;
  if (!isConfigured()) {
    safeLog.warn('Queue join SMS skipped: Twilio not configured');
    return;
  }

  try {
    await sendSMS(body.phone, buildQueueJoinMessage({ body, entries, resumeCode }));
    safeLog.info('Queue join SMS sent');
  } catch (error) {
    safeLog.warn('Queue join SMS failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

module.exports = { buildQueueJoinMessage, notifyQueueJoined };
