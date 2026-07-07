require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildRedisUrl() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const host = requireEnv('REDIS_HOST');
  const port = process.env.REDIS_PORT || '6379';
  const username = process.env.REDIS_USERNAME || 'default';
  const password = process.env.REDIS_PASSWORD || '';
  const scheme = process.env.REDIS_TLS === 'true' ? 'rediss' : 'redis';
  const auth = password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
  return `${scheme}://${auth}${host}:${port}`;
}

const env = {
  port: Number(process.env.PORT) || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  mysql: {
    host: requireEnv('MYSQL_HOST'),
    user: requireEnv('MYSQL_USER'),
    password: process.env.MYSQL_PASSWORD ?? '',
    database: requireEnv('MYSQL_DATABASE'),
  },
  redisUrl: buildRedisUrl(),
  avgVisitMinutes: Number(process.env.AVG_VISIT_MINUTES) || 15,
  clinicHours: process.env.CLINIC_HOURS || '8:00 AM - 5:00 PM',
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  staffAllowedIps: (process.env.STAFF_ALLOWED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_FROM_NUMBER,
  },
};

module.exports = env;
