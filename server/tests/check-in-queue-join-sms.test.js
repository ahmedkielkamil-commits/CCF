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

function loadCheckInWithSmsMocks({ smsOptIn = true } = {}) {
  jest.resetModules();

  const waitingRedis = {
    reserve: jest.fn(async () => [1]),
    add: jest.fn(async () => {}),
  };
  const waitingMysql = {
    insert: jest.fn(async () => ({
      registrationid: 10,
      entries: [{ entryid: 1, position: 1, status: 'waiting' }],
    })),
  };
  const notifyQueueJoined = jest.fn(async () => {});
  const issueResumeToken = jest.fn(async () => ({ token: 'resume-token', code: '4829' }));
  const recalcAndBroadcast = jest.fn(async () => ({ entries: [] }));

  jest.doMock('../src/features/waiting/redis', () => waitingRedis);
  jest.doMock('../src/features/waiting/mysql', () => waitingMysql);
  jest.doMock('../src/ws/broadcast', () => ({
    buildQueuePayload: jest.fn(async () => ({ entries: [] })),
    buildMonitorPayload: jest.fn(async () => ({ entries: [] })),
    recalcAndBroadcast,
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
  jest.doMock('../src/features/waiting/queueJoinSms', () => ({ notifyQueueJoined }));
  jest.doMock('../src/features/arrived/arrivedSms', () => ({ notifyArrived: jest.fn(async () => {}) }));
  jest.doMock('../src/features/roomed/roomedSms', () => ({ notifyRoomed: jest.fn(async () => {}) }));
  jest.doMock('../src/features/completed/completedSms', () => ({ notifyCompleted: jest.fn(async () => {}) }));
  jest.doMock('../src/features/_shared/registrationContact', () => ({ loadRegistrationContact: jest.fn() }));
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
    checkIn = require('../src/bus').__testables.checkIn;
  });

  return { checkIn, notifyQueueJoined, smsOptIn };
}

describe('check-in queue join SMS wiring', () => {
  test('successful check-in triggers notifyQueueJoined when sms_opt_in is true', async () => {
    const { checkIn, notifyQueueJoined } = loadCheckInWithSmsMocks();

    await checkIn(validBody());

    expect(notifyQueueJoined).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          parent_fname: 'Jane',
          phone: '5551234567',
          sms_opt_in: true,
        }),
        entries: [{ entryid: 1, position: 1, status: 'waiting' }],
        resumeCode: '4829',
      })
    );
  });

  test('check-in still passes sms_opt_in false through to notifier', async () => {
    const { checkIn, notifyQueueJoined } = loadCheckInWithSmsMocks();
    const body = { ...validBody(), sms_opt_in: false };

    await checkIn(body);

    expect(notifyQueueJoined).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ sms_opt_in: false }),
      })
    );
  });

  test('check-in succeeds even if notifyQueueJoined rejects', async () => {
    jest.resetModules();

    const notifyQueueJoined = jest.fn(async () => {
      throw new Error('sms down');
    });

    jest.doMock('../src/features/waiting/redis', () => ({
      reserve: jest.fn(async () => [1]),
      add: jest.fn(async () => {}),
    }));
    jest.doMock('../src/features/waiting/mysql', () => ({
      insert: jest.fn(async () => ({
        registrationid: 10,
        entries: [{ entryid: 1, position: 1, status: 'waiting' }],
      })),
    }));
    jest.doMock('../src/ws/broadcast', () => ({
      buildQueuePayload: jest.fn(async () => ({ entries: [] })),
      buildMonitorPayload: jest.fn(async () => ({ entries: [] })),
      recalcAndBroadcast: jest.fn(async () => ({ entries: [] })),
    }));
    jest.doMock('../src/db/redis', () => ({ client: { incr: jest.fn() } }));
    jest.doMock('../src/features/_shared/store-health', () => ({
      canUseRedis: jest.fn(async () => true),
      canUseMysql: jest.fn(async () => true),
      isTemporaryEntryId: () => false,
    }));
    jest.doMock('../src/features/_shared/mysql-outbox', () => ({
      enqueueCheckIn: jest.fn(),
      enqueueStatusUpdate: jest.fn(),
      processOutbox: jest.fn(async () => ({ processed: 0, pending: 0 })),
    }));
    jest.doMock('../src/features/_shared/resume-token', () => ({
      issueResumeToken: jest.fn(async () => ({ token: 'resume-token', code: '4829' })),
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
    jest.doMock('../src/features/waiting/queueJoinSms', () => ({ notifyQueueJoined }));
    jest.doMock('../src/features/arrived/arrivedSms', () => ({ notifyArrived: jest.fn(async () => {}) }));
    jest.doMock('../src/features/roomed/roomedSms', () => ({ notifyRoomed: jest.fn(async () => {}) }));
    jest.doMock('../src/features/completed/completedSms', () => ({ notifyCompleted: jest.fn(async () => {}) }));
    jest.doMock('../src/features/_shared/registrationContact', () => ({ loadRegistrationContact: jest.fn() }));
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
      checkIn = require('../src/bus').__testables.checkIn;
    });

    await expect(checkIn(validBody())).resolves.toMatchObject({
      registrationid: 10,
      entries: [{ entryid: 1, position: 1, status: 'waiting' }],
    });
  });
});
