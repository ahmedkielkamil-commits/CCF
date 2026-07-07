const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { connectRedis, closeRedis } = require('./db/redis');
const { closePool } = require('./db/mysql');
const bus = require('./bus');
const { initSocket } = require('./ws/broadcast');
const { safeLog } = require('./bus/hipaa/safeLog');
const enforceHttps = require('./bus/hipaa/enforceHttps');
const { sendSMS } = require('./features/waiting/twilio');
const { processOutbox } = require('./features/_shared/mysql-outbox');

const app = express();
app.set('trust proxy', 1);

app.use(enforceHttps);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);
app.use(
  cors({
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
  })
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/test-sms', async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone?.trim()) return res.status(400).json({ message: 'phone required' });
    await sendSMS(phone.trim(), 'Hi, this is Twilio!');
    res.json({ message: 'SMS sent!' });
  } catch (err) {
    next(err);
  }
});

app.use('/api', bus);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const body = { error: err.message || 'Internal server error' };
  if (err.details) body.details = err.details;

  if (status >= 500) {
    safeLog.error('Request error', { status, message: err.message });
  } else if (status === 400 && err.details) {
    safeLog.warn('Validation failed', { count: err.details.length });
  }

  res.status(status).json(body);
});

const server = http.createServer(app);
initSocket(server);
let outboxWorker = null;

function startOutboxWorker() {
  if (outboxWorker) return;
  outboxWorker = setInterval(async () => {
    try {
      const result = await processOutbox();
      if (result.processed > 0) {
        safeLog.info('Replayed queued MySQL outbox events', {
          processed: result.processed,
          pending: result.pending,
        });
      }
    } catch (err) {
      safeLog.error('Outbox worker error', { message: err.message });
    }
  }, 10000);
  outboxWorker.unref();
}

async function start() {
  await connectRedis();
  startOutboxWorker();
  server.listen(env.port, () => {
    safeLog.info(`CCoF server listening on port ${env.port}`);
  });
}

async function shutdown() {
  safeLog.info('Shutting down...');
  if (outboxWorker) {
    clearInterval(outboxWorker);
    outboxWorker = null;
  }
  server.close();
  await closeRedis();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  safeLog.error('Failed to start server', { message: err.message });
  process.exit(1);
});
