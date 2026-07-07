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

function loadCheckIn() {
  jest.resetModules();

  jest.doMock('../src/features/waiting/redis', () => ({ reserve: jest.fn(), add: jest.fn() }));
  jest.doMock('../src/features/waiting/mysql', () => ({ reserve: jest.fn(), insert: jest.fn() }));
  jest.doMock('../src/ws/broadcast', () => ({
    buildQueuePayload: jest.fn(async () => ({ entries: [] })),
    buildMonitorPayload: jest.fn(async () => ({ entries: [] })),
    recalcAndBroadcast: jest.fn(async () => ({ entries: [] })),
  }));
  jest.doMock('../src/db/redis', () => ({ client: { incr: jest.fn() } }));
  jest.doMock('../src/features/_shared/store-health', () => ({
    canUseRedis: jest.fn(async () => true),
    canUseMysql: jest.fn(async () => true),
    isTemporaryEntryId: (entryId) => Number(entryId) < 0,
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
  return checkIn;
}

describe('POST /api/check-in validation', () => {
  test('rejects missing parent and child fields with details[]', async () => {
    const checkIn = loadCheckIn();
    const payload = {
      parent_fname: '',
      parent_lname: '',
      phone: '',
      children: [{ fname: '', lname: '', symptoms: '' }],
    };

    await expect(checkIn(payload)).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([
        'parent_fname is required',
        'parent_lname is required',
        'phone is required',
        'children[0].fname is required',
        'children[0].lname is required',
        'children[0].symptoms is required',
      ]),
    });
  });

  test('rejects missing children array', async () => {
    const checkIn = loadCheckIn();
    const payload = { ...validBody(), children: [] };
    await expect(checkIn(payload)).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining(['at least one child is required']),
    });
  });

  test('rejects malformed payload types with 400 details', async () => {
    const checkIn = loadCheckIn();
    const payload = {
      parent_fname: 123,
      parent_lname: null,
      phone: {},
      children: 'bad-children-type',
    };
    await expect(checkIn(payload)).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([
        'parent_fname is required',
        'parent_lname is required',
        'phone is required',
        'at least one child is required',
      ]),
    });
  });
});
