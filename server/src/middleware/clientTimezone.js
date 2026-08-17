const { resolveTimezone, runWithTimezone, rememberClientTimezone } = require('../utils/timezone');

module.exports = function clientTimezone(req, res, next) {
  const timezone = resolveTimezone(req.get('X-Client-Timezone'));
  rememberClientTimezone(timezone);
  runWithTimezone(timezone, () => next());
};
