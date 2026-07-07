function validBody() {
  return {
    parent_fname: 'Jane',
    parent_lname: 'Doe',
    phone: '5551234567',
    additional_notes: null,
    sms_opt_in: true,
    children: [
      { fname: 'Amy', lname: 'Doe', symptoms: 'Fever' },
    ],
  };
}

function loadCheckInWithHealth({ redisUp, mysqlUp }) {
  jest.resetModules();

  const waitingRedis = { reserve: jest.fn(), add: jest.fn() };
  const waitingMysql = { reserve: jest.fn(), insert: jest.fn() };
  const issueResumeToken = jest.fn();
  const enqueueCheckIn = jest.fn();
  const processOutbox = jest.fn().mockResolvedValue({ processed: 0, pending: 0 });
  const recalcAndBroadcast = jest.fn();
  const buildQueuePayload = jest.fn();
  const redisClient = { incr: jest.fn() };

  jest.doMock('../src/features/waiting/redis', () => waitingRedis);
  jest.doMock('../src/features/waiting/mysql', () => waitingMysql);
  jest.doMock('../src/ws/broadcast', () => ({
    buildQueuePayload,
    buildMonitorPayload: jest.fn(),
    recalcAndBroadcast,
  }));
  jest.doMock('../src/db/redis', () => ({ client: redisClient }));
  jest.doMock('../src/features/_shared/store-health', () => ({
    canUseRedis: jest.fn(async () => redisUp),
    canUseMysql: jest.fn(async () => mysqlUp),
    isTemporaryEntryId: (entryId) => Number(entryId) < 0,
  }));
  jest.doMock('../src/features/_shared/mysql-outbox', () => ({
    enqueueCheckIn,
    enqueueStatusUpdate: jest.fn(),
    processOutbox,
  }));
  jest.doMock('../src/features/_shared/resume-token', () => ({
    issueResumeToken,
    getResumeSession: jest.fn(),
    getResumeSessionByCode: jest.fn(),
    cleanupIfRegistrationNotLive: jest.fn(),
  }));

  jest.doMock('../src/features/_shared/entry', () => ({ load: jest.fn(), notFound: jest.fn() }));
  jest.doMock('../src/features/_shared/waitTime', () => ({
    getTime: jest.fn(),
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
  jest.doMock('../src/utils/audit', () => ({ buildAuditRecord: jest.fn(() => ({})) }));
  jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
  jest.doMock('../src/bus/hipaa/staffIpAllowlist', () => (_req, _res, next) => next());
  jest.doMock('../src/features/arrived/redis', () => ({ apply: jest.fn() }));
  jest.doMock('../src/features/arrived/mysql', () => ({ apply: jest.fn() }));
  jest.doMock('../src/features/roomed/redis', () => ({ remove: jest.fn() }));
  jest.doMock('../src/features/roomed/mysql', () => ({ apply: jest.fn(), shift: jest.fn() }));
  jest.doMock('../src/features/completed/redis', () => ({ apply: jest.fn() }));
  jest.doMock('../src/features/completed/mysql', () => ({ apply: jest.fn() }));
  jest.doMock('../src/features/no_show/redis', () => ({ remove: jest.fn() }));
  jest.doMock('../src/features/no_show/mysql', () => ({ apply: jest.fn(), shift: jest.fn() }));

  let checkIn;
  jest.isolateModules(() => {
    const router = require('../src/bus');
    checkIn = router.__testables.checkIn;
  });

  return {
    checkIn,
    waitingRedis,
    waitingMysql,
    issueResumeToken,
    enqueueCheckIn,
    processOutbox,
    recalcAndBroadcast,
    buildQueuePayload,
    redisClient,
  };
}

describe('check-in failover modes', () => {
  test('returns 503 when redis is unavailable', async () => {
    const ctx = loadCheckInWithHealth({ redisUp: false, mysqlUp: true });

    await expect(ctx.checkIn(validBody())).rejects.toMatchObject({ status: 503 });

    expect(ctx.processOutbox).toHaveBeenCalled();
    expect(ctx.waitingMysql.reserve).not.toHaveBeenCalled();
    expect(ctx.waitingMysql.insert).not.toHaveBeenCalled();
    expect(ctx.waitingRedis.reserve).not.toHaveBeenCalled();
    expect(ctx.issueResumeToken).not.toHaveBeenCalled();
  });

  test('uses redis_outbox mode when mysql is unavailable', async () => {
    const ctx = loadCheckInWithHealth({ redisUp: true, mysqlUp: false });

    ctx.waitingRedis.reserve.mockResolvedValueOnce([3]);
    ctx.redisClient.incr.mockResolvedValueOnce(10).mockResolvedValueOnce(20);
    ctx.waitingRedis.add.mockResolvedValueOnce();
    ctx.enqueueCheckIn.mockResolvedValueOnce();
    ctx.recalcAndBroadcast.mockResolvedValueOnce({ entries: [{ entryid: -20, position: 3 }] });
    ctx.issueResumeToken.mockResolvedValueOnce({ token: 'tok', code: '123456' });

    const result = await ctx.checkIn(validBody());

    expect(ctx.waitingRedis.reserve).toHaveBeenCalled();
    expect(ctx.waitingRedis.add).toHaveBeenCalled();
    expect(ctx.enqueueCheckIn).toHaveBeenCalled();
    expect(ctx.issueResumeToken).toHaveBeenCalled();
    expect(result.registrationid).toBeLessThan(0);
    expect(result.sync).toEqual({ mode: 'redis_outbox', pending: true });
  });
});
