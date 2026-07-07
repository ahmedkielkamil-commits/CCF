const express = require('express');
const request = require('supertest');

function loadAppForResumeCancel() {
  jest.resetModules();

  const query = jest.fn();
  const load = jest.fn();
  const noShowMysql = { apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) };
  const noShowRedis = { remove: jest.fn(async () => {}) };
  const getResumeSessionByCode = jest.fn();
  const getResumeSession = jest.fn();

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
    getResumeSession,
    getResumeSessionByCode,
    cleanupIfRegistrationNotLive: jest.fn(async () => {}),
  }));

  jest.doMock('../src/ws/broadcast', () => ({
    buildQueuePayload: jest.fn(async () => ({ entries: [] })),
    buildMonitorPayload: jest.fn(async () => ({ entries: [] })),
    recalcAndBroadcast: jest.fn(async () => ({ entries: [] })),
  }));
  jest.doMock('../src/features/_shared/store-health', () => ({
    canUseRedis: jest.fn(async () => true),
    canUseMysql: jest.fn(async () => true),
    isTemporaryEntryId: jest.fn(() => false),
  }));
  jest.doMock('../src/features/_shared/mysql-outbox', () => ({
    enqueueCheckIn: jest.fn(),
    enqueueStatusUpdate: jest.fn(async () => {}),
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
      res.status(err.status || 500).json({ error: err.message, details: err.details });
    });
  });

  return {
    app,
    query,
    load,
    noShowMysql,
    noShowRedis,
    getResumeSessionByCode,
    getResumeSession,
  };
}

describe('resume/cancel edge behavior', () => {
  test('returns 404 for invalid or expired resume token/code', async () => {
    const ctx = loadAppForResumeCancel();
    ctx.getResumeSessionByCode.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    ctx.getResumeSession.mockResolvedValueOnce(null);

    let res = await request(ctx.app).get('/api/parent/resume/123456');
    expect(res.status).toBe(404);

    res = await request(ctx.app).post('/api/parent/cancel/123456').send({});
    expect(res.status).toBe(404);
  });

  test('cancel is idempotent (second call succeeds with zero cancellations)', async () => {
    const ctx = loadAppForResumeCancel();

    ctx.getResumeSessionByCode.mockResolvedValue({
      registrationid: 1,
      token: 'tok',
      code: '123456',
    });
    ctx.query
      .mockResolvedValueOnce([{ entryid: 11 }]) // first cancel pass
      .mockResolvedValueOnce([]); // second cancel pass
    ctx.load.mockResolvedValue({
      entryid: 11,
      registrationid: 1,
      position: 1,
      status: 'waiting',
    });

    let res = await request(ctx.app).post('/api/parent/cancel/123456').send({});
    expect(res.status).toBe(200);
    expect(res.body.cancelledCount).toBe(1);

    res = await request(ctx.app).post('/api/parent/cancel/123456').send({});
    expect(res.status).toBe(200);
    expect(res.body.cancelledCount).toBe(0);
  });
});
