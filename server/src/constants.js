const env = require('./config/env');

const STATUSES = ['waiting', 'arrived', 'roomed', 'completed', 'no_show'];
const REDIS_REMOVING_STATUSES = ['roomed', 'no_show'];
const AVG_VISIT_MINUTES = env.avgVisitMinutes;

const REDIS_KEYS = {
  live: 'queue:live',
  entry: (entryId) => `queue:entry:${entryId}`,
  resumeToken: (token) => `queue:resume:${token}`,
  resumeRegistration: (registrationId) => `queue:resume:reg:${registrationId}`,
  resumeCode: (code) => `queue:resume:code:${code}`,
  clinicHoursOverride: 'clinic:hours_override',
  mysqlOutbox: 'queue:mysql_outbox',
  tempRegistrationSeq: 'queue:temp:registration_seq',
  tempEntrySeq: 'queue:temp:entry_seq',
  tempRegistrationMap: (tempRegistrationId) => `queue:temp:regmap:${tempRegistrationId}`,
};

module.exports = {
  STATUSES,
  REDIS_REMOVING_STATUSES,
  AVG_VISIT_MINUTES,
  REDIS_KEYS,
};
