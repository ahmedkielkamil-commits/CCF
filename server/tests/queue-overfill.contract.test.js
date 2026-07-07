function validBody() {
  return {
    parent_fname: 'Jane',
    parent_lname: 'Doe',
    phone: '5551234567',
    additional_notes: null,
    sms_opt_in: true,
    children: [{ fname: 'Amy', lname: 'Doe', symptoms: 'Fever' }],
  };
}

function loadCheckInAtCapacity() {
  jest.resetModules();

  const waitingRedis = { reserve: jest.fn(async () => [51]), add: jest.fn(async () => {}) };
  const waitingMysql = {
    reserve: jest.fn(),
    insert: jest.fn(async () => ({
      registrationid: 500,
      entries: [{ entryid: 900, position: 51, status: 'waiting' }],
    })),
  };

  jest.doMock('../src/features/waiting/redis', () => waitingRedis);
  jest.doMock('../src/features/waiting/mysql', () => waitingMysql);
  jest.doMock('../src/ws/broadcast', () => ({
    buildQueuePayload: jest.fn(async () => ({
      entries: Array.from({ length: 50 }, (_, i) => ({ entryid: i + 1, position: i + 1, status: 'waiting' })),
      roomingInterval: { minutes: 15 },
    })),
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
    enqueueStatusUpdate: jest.fn(),
    processOutbox: jest.fn(async () => ({ processed: 0, pending: 0 })),
  }));
  jest.doMock('../src/features/_shared/resume-token', () => ({
    issueResumeToken: jest.fn(async () => ({ token: 'tok', code: '123456' })),
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
  jest.doMock('../src/db/redis', () => ({ client: { incr: jest.fn() } }));

  let checkIn;
  jest.isolateModules(() => {
    const router = require('../src/bus');
    checkIn = router.__testables.checkIn;
  });

  return { checkIn };
}

describe('queue overfill backend contract', () => {
  test('rejects check-in when queue is at capacity', async () => {
    const { checkIn } = loadCheckInAtCapacity();
    // Contract: backend should enforce max active queue cap and reject with 429.
    await expect(checkIn(validBody())).rejects.toMatchObject({
      status: 429,
      code: 'QUEUE_FULL',
    });
  });
});
