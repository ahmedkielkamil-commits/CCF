const express = require('express');
const request = require('supertest');

function loadAppWithRedisFailureOnParentCancel() {
  jest.resetModules();

  const query = jest.fn();
  const load = jest.fn();
  const noShowMysql = { apply: jest.fn(), shift: jest.fn() };
  const noShowRedis = { remove: jest.fn() };

  jest.doMock('../src/db/mysql', () => ({ query }));
  jest.doMock('../src/features/_shared/entry', () => ({
    load,
    notFound: () => {
      const err = new Error('Queue entry not found');
      err.status = 404;
      return err;
    },
  }));
  jest.doMock('../src/features/no_show/mysql', () => noShowMysql);
  jest.doMock('../src/features/no_show/redis', () => noShowRedis);
  jest.doMock('../src/features/_shared/resume-token', () => ({
    issueResumeToken: jest.fn(),
    getResumeSession: jest.fn(),
    getResumeSessionByCode: jest.fn(async () => ({
      registrationid: 1,
      token: 'mock-token',
      code: '123456',
    })),
    cleanupIfRegistrationNotLive: jest.fn(),
  }));

  jest.doMock('../src/ws/broadcast', () => ({
    buildQueuePayload: jest.fn(async () => ({ entries: [] })),
    buildMonitorPayload: jest.fn(async () => ({ entries: [] })),
    recalcAndBroadcast: jest.fn(async () => ({ entries: [] })),
  }));
  jest.doMock('../src/features/_shared/store-health', () => ({
    canUseRedis: jest.fn(async () => false),
    canUseMysql: jest.fn(async () => true),
    isTemporaryEntryId: jest.fn(() => false),
  }));
  jest.doMock('../src/features/_shared/mysql-outbox', () => ({
    enqueueCheckIn: jest.fn(),
    enqueueStatusUpdate: jest.fn(),
    processOutbox: jest.fn(async () => ({ processed: 0, pending: 0 })),
  }));
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
  jest.doMock('../src/features/_shared/sync', () => ({ getSyncReport: jest.fn() }));
  jest.doMock('../src/utils/audit', () => ({ buildAuditRecord: jest.fn(() => ({ timestamp: 't' })) }));
  jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
  jest.doMock('../src/bus/hipaa/staffIpAllowlist', () => (_req, _res, next) => next());
  jest.doMock('../src/features/waiting/redis', () => ({ reserve: jest.fn(), add: jest.fn() }));
  jest.doMock('../src/features/waiting/mysql', () => ({ reserve: jest.fn(), insert: jest.fn() }));
  jest.doMock('../src/features/arrived/redis', () => ({ apply: jest.fn() }));
  jest.doMock('../src/features/arrived/mysql', () => ({ apply: jest.fn() }));
  jest.doMock('../src/features/roomed/redis', () => ({ remove: jest.fn() }));
  jest.doMock('../src/features/roomed/mysql', () => ({ apply: jest.fn(), shift: jest.fn() }));
  jest.doMock('../src/features/completed/redis', () => ({ apply: jest.fn() }));
  jest.doMock('../src/features/completed/mysql', () => ({ apply: jest.fn() }));
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

  return { app, query, load, noShowMysql, noShowRedis };
}

describe('parent cancel outage contract', () => {
  test('should still cancel via mysql path when redis remove fails', async () => {
    const ctx = loadAppWithRedisFailureOnParentCancel();

    ctx.query.mockResolvedValueOnce([{ entryid: 11 }]);
    ctx.load.mockResolvedValueOnce({
      entryid: 11,
      position: 1,
      status: 'waiting',
      registrationid: 1,
    });
    ctx.noShowMysql.apply.mockResolvedValueOnce();
    ctx.noShowMysql.shift.mockResolvedValueOnce();
    ctx.noShowRedis.remove.mockRejectedValueOnce(new Error('redis down'));

    const res = await request(ctx.app).post('/api/parent/cancel/123456').send({});

    // This is a resilience contract test. It currently fails and should drive a fix:
    // parent cancel should degrade to mysql-only behavior when Redis is unavailable.
    expect(res.status).toBe(200);
  });
});
