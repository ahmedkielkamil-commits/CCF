const express = require('express');
const request = require('supertest');

function loadApp() {
  jest.resetModules();

  const load = jest.fn(async () => ({
    entryid: 7,
    registrationid: 42,
    position: 2,
    status: 'waiting',
  }));
  const arrivedMysql = { apply: jest.fn(async () => {}) };
  const completedMysql = { apply: jest.fn(async () => {}) };
  const roomedMysql = { apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) };
  const noShowMysql = { apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) };
  const arrivedRedis = { apply: jest.fn(async () => {}) };
  const completedRedis = { apply: jest.fn(async () => {}) };
  const roomedRedis = { remove: jest.fn(async () => {}) };
  const noShowRedis = { remove: jest.fn(async () => {}) };
  const recalcAndBroadcast = jest.fn(async () => ({ entries: [] }));

  jest.doMock('../src/features/_shared/entry', () => ({
    load,
    notFound: () => {
      const err = new Error('Queue entry not found');
      err.status = 404;
      return err;
    },
  }));
  jest.doMock('../src/features/arrived/mysql', () => arrivedMysql);
  jest.doMock('../src/features/completed/mysql', () => completedMysql);
  jest.doMock('../src/features/roomed/mysql', () => roomedMysql);
  jest.doMock('../src/features/no_show/mysql', () => noShowMysql);
  jest.doMock('../src/features/arrived/redis', () => arrivedRedis);
  jest.doMock('../src/features/completed/redis', () => completedRedis);
  jest.doMock('../src/features/roomed/redis', () => roomedRedis);
  jest.doMock('../src/features/no_show/redis', () => noShowRedis);
  jest.doMock('../src/ws/broadcast', () => ({
    buildQueuePayload: jest.fn(async () => ({ entries: [] })),
    buildMonitorPayload: jest.fn(async () => ({ entries: [] })),
    recalcAndBroadcast,
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
  jest.doMock('../src/db/mysql', () => ({ query: jest.fn() }));
  jest.doMock('../src/features/_shared/sync', () => ({ getSyncReport: jest.fn() }));
  jest.doMock('../src/utils/audit', () => ({ buildAuditRecord: jest.fn(() => ({ timestamp: 't' })) }));
  jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
  jest.doMock('../src/bus/hipaa/staffIpAllowlist', () => (_req, _res, next) => next());
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

  return { app, arrivedMysql, completedMysql, roomedMysql, noShowMysql };
}

describe('PATCH /api/queue/:entryId rules', () => {
  test('rejects invalid statuses', async () => {
    const { app } = loadApp();
    const res = await request(app).patch('/api/queue/7').send({ status: 'invalid', staff_name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid status/);
  });

  test('allows waiting -> arrived', async () => {
    const { app, arrivedMysql } = loadApp();
    const res = await request(app).patch('/api/queue/7').send({ status: 'arrived' });
    expect(res.status).toBe(200);
    expect(arrivedMysql.apply).toHaveBeenCalled();
  });

  test('allows waiting -> roomed/no_show/completed with staff_name', async () => {
    let ctx = loadApp();
    let res = await request(ctx.app).patch('/api/queue/7').send({ status: 'roomed', staff_name: 'Sarah' });
    expect(res.status).toBe(200);
    expect(ctx.roomedMysql.apply).toHaveBeenCalled();

    ctx = loadApp();
    res = await request(ctx.app).patch('/api/queue/7').send({ status: 'no_show', staff_name: 'Sarah' });
    expect(res.status).toBe(200);
    expect(ctx.noShowMysql.apply).toHaveBeenCalled();

    ctx = loadApp();
    res = await request(ctx.app).patch('/api/queue/7').send({ status: 'completed', staff_name: 'Sarah' });
    expect(res.status).toBe(200);
    expect(ctx.completedMysql.apply).toHaveBeenCalled();
  });

  test('rejects missing staff_name for statuses that require it', async () => {
    const { app } = loadApp();
    const statuses = ['roomed', 'no_show', 'completed'];
    for (const status of statuses) {
      const res = await request(app).patch('/api/queue/7').send({ status });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('staff_name is required');
    }
  });
});
