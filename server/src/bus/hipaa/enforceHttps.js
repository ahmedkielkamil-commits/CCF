const env = require('../../config/env');

function enforceHttps(req, res, next) {
  if (env.nodeEnv !== 'production') return next();
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
  return res.status(403).json({ error: 'HTTPS required' });
}

module.exports = enforceHttps;
