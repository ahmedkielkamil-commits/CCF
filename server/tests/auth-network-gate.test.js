const express = require('express');
const request = require('supertest');

describe('staff IP allowlist behavior', () => {
  test('returns 403 when requester IP is not allowlisted', () => {
    jest.resetModules();
    jest.doMock('../src/config/env', () => ({ staffAllowedIps: ['10.0.0.1/32'] }));
    jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog: { warn: jest.fn() } }));

    let middleware;
    jest.isolateModules(() => {
      middleware = require('../src/bus/hipaa/staffIpAllowlist');
    });

    const req = { ip: '192.168.1.10' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('public routes still work while staff routes are blocked', async () => {
    jest.resetModules();

    jest.doMock('../src/config/env', () => ({
      staffAllowedIps: ['10.0.0.1/32'],
      corsOrigins: [],
      redisUrl: 'redis://127.0.0.1:6379/15',
      avgVisitMinutes: 15,
      clinicHours: '8:00 AM - 5:00 PM',
      mysql: { host: 'h', user: 'u', password: '', database: 'd' },
      nodeEnv: 'test',
      port: 8080,
      twilio: {},
    }));
    jest.doMock('../src/ws/broadcast', () => ({
      buildQueuePayload: jest.fn(async () => ({ entries: [], roomingInterval: { minutes: 15 } })),
      buildMonitorPayload: jest.fn(async () => ({ entries: [], roomingInterval: { minutes: 15 } })),
      recalcAndBroadcast: jest.fn(async () => ({ entries: [] })),
    }));
    jest.doMock('../src/features/_shared/sync', () => ({
      getSyncReport: jest.fn(async () => ({ live: { inSync: true, mismatchCount: 0, mismatches: [] } })),
    }));
    jest.doMock('../src/features/waiting/redis', () => ({ reserve: jest.fn(), add: jest.fn() }));
    jest.doMock('../src/features/waiting/mysql', () => ({ reserve: jest.fn(), insert: jest.fn() }));
    jest.doMock('../src/features/_shared/store-health', () => ({
      canUseRedis: jest.fn(async () => true),
      canUseMysql: jest.fn(async () => true),
      isTemporaryEntryId: jest.fn(() => false),
    }));
    jest.doMock('../src/features/_shared/mysql-outbox', () => ({
      enqueueCheckIn: jest.fn(),
      enqueueStatusUpdate: jest.fn(),
      processOutbox: jest.fn(async () => ({ processed: 0, pending: 0 })),
    }));
    jest.doMock('../src/features/_shared/resume-token', () => ({
      issueResumeToken: jest.fn(),
      getResumeSession: jest.fn(),
      getResumeSessionByCode: jest.fn(),
      cleanupIfRegistrationNotLive: jest.fn(),
    }));
    jest.doMock('../src/features/_shared/entry', () => ({ load: jest.fn(), notFound: jest.fn() }));
    jest.doMock('../src/features/_shared/waitTime', () => ({
      getTime: jest.fn(async () => ({ minutes: 15, source: 'default' })),
      setTime: jest.fn(),
      clearTime: jest.fn(),
      getEstimatedWait: jest.fn(() => '15 min - 30 min'),
    }));
    jest.doMock('../src/features/_shared/clinicHours', () => ({
      getClinicHours: jest.fn(),
      setClinicHours: jest.fn(),
      clearClinicHours: jest.fn(),
    }));
    jest.doMock('../src/db/mysql', () => ({ query: jest.fn(async () => []) }));
    jest.doMock('../src/utils/audit', () => ({ buildAuditRecord: jest.fn(() => ({})) }));
    jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
    jest.doMock('../src/features/arrived/redis', () => ({ apply: jest.fn() }));
    jest.doMock('../src/features/arrived/mysql', () => ({ apply: jest.fn() }));
    jest.doMock('../src/features/roomed/redis', () => ({ remove: jest.fn() }));
    jest.doMock('../src/features/roomed/mysql', () => ({ apply: jest.fn(), shift: jest.fn() }));
    jest.doMock('../src/features/completed/redis', () => ({ apply: jest.fn() }));
    jest.doMock('../src/features/completed/mysql', () => ({ apply: jest.fn() }));
    jest.doMock('../src/features/no_show/redis', () => ({ remove: jest.fn() }));
    jest.doMock('../src/features/no_show/mysql', () => ({ apply: jest.fn(), shift: jest.fn() }));
    jest.doMock('../src/db/redis', () => ({ client: { incr: jest.fn() } }));

    let app;
    jest.isolateModules(() => {
      const bus = require('../src/bus');
      app = express();
      app.use(express.json());
      app.use('/api', bus);
      app.use((err, _req, res, _next) => {
        res.status(err.status || 500).json({ error: err.message });
      });
    });

    const publicRes = await request(app).get('/api/queue');
    expect(publicRes.status).toBe(200);

    const staffRes = await request(app).get('/api/sync');
    expect(staffRes.status).toBe(403);
    expect(staffRes.body.error).toBe('Forbidden');
  });
});
