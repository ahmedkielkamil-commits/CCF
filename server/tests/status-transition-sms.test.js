function loadStatusHandlers({
  prevStatus = 'waiting',
  registrationContact = { phone: '+15551234567', sms_opt_in: true },
} = {}) {
  jest.resetModules();

  const load = jest.fn(async () => ({
    entryid: 7,
    registrationid: 42,
    position: 2,
    status: prevStatus,
  }));

  const notifyArrived = jest.fn(async () => {});
  const notifyRoomed = jest.fn(async () => {});
  const notifyCompleted = jest.fn(async () => {});
  const loadRegistrationContact = jest.fn(async () => registrationContact);

  jest.doMock('../src/features/_shared/entry', () => ({
    load,
    notFound: () => {
      const err = new Error('Queue entry not found');
      err.status = 404;
      return err;
    },
  }));
  jest.doMock('../src/features/arrived/mysql', () => ({ apply: jest.fn(async () => {}) }));
  jest.doMock('../src/features/completed/mysql', () => ({ apply: jest.fn(async () => {}) }));
  jest.doMock('../src/features/roomed/mysql', () => ({ apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) }));
  jest.doMock('../src/features/no_show/mysql', () => ({ apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) }));
  jest.doMock('../src/features/arrived/redis', () => ({ apply: jest.fn(async () => {}) }));
  jest.doMock('../src/features/completed/redis', () => ({ apply: jest.fn(async () => {}) }));
  jest.doMock('../src/features/roomed/redis', () => ({ remove: jest.fn(async () => {}) }));
  jest.doMock('../src/features/no_show/redis', () => ({ remove: jest.fn(async () => {}) }));
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
    processOutbox: jest.fn(async () => ({ processed: 0, pending: 0 })),
  }));
  jest.doMock('../src/features/_shared/resume-token', () => ({
    cleanupIfRegistrationNotLive: jest.fn(async () => {}),
  }));
  jest.doMock('../src/utils/audit', () => ({ buildAuditRecord: jest.fn(() => ({ timestamp: 't' })) }));
  jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
  jest.doMock('../src/features/waiting/queueJoinSms', () => ({ notifyQueueJoined: jest.fn(async () => {}) }));
  jest.doMock('../src/features/arrived/arrivedSms', () => ({ notifyArrived }));
  jest.doMock('../src/features/roomed/roomedSms', () => ({ notifyRoomed }));
  jest.doMock('../src/features/completed/completedSms', () => ({ notifyCompleted }));
  jest.doMock('../src/features/_shared/registrationContact', () => ({ loadRegistrationContact }));

  let handlers;
  jest.isolateModules(() => {
    handlers = require('../src/bus').__testables;
  });

  return {
    handlers,
    notifyArrived,
    notifyRoomed,
    notifyCompleted,
    loadRegistrationContact,
  };
}

describe('status transition SMS wiring', () => {
  test('waiting -> arrived notifies arrived SMS with registration contact', async () => {
    const { handlers, notifyArrived } = loadStatusHandlers({ prevStatus: 'waiting' });

    await handlers.applyArrived(7, 'Sarah', { ip: '127.0.0.1' });

    expect(notifyArrived).toHaveBeenCalledWith({
      phone: '+15551234567',
      sms_opt_in: true,
    });
  });

  test('waiting -> roomed notifies roomed SMS', async () => {
    const { handlers, notifyRoomed } = loadStatusHandlers({ prevStatus: 'waiting' });

    await handlers.applyRoomed(7, 'Sarah', { ip: '127.0.0.1' });

    expect(notifyRoomed).toHaveBeenCalledWith({
      phone: '+15551234567',
      sms_opt_in: true,
    });
  });

  test('roomed -> completed notifies completed SMS', async () => {
    const { handlers, notifyCompleted } = loadStatusHandlers({ prevStatus: 'roomed' });

    await handlers.applyCompleted(7, 'Sarah', { ip: '127.0.0.1' });

    expect(notifyCompleted).toHaveBeenCalledWith({
      phone: '+15551234567',
      sms_opt_in: true,
    });
  });

  test('no_show does not notify status SMS handlers', async () => {
    const { handlers, notifyArrived, notifyRoomed, notifyCompleted } = loadStatusHandlers({
      prevStatus: 'waiting',
    });

    await handlers.applyNoShow(7, 'Sarah', { ip: '127.0.0.1' });

    expect(notifyArrived).not.toHaveBeenCalled();
    expect(notifyRoomed).not.toHaveBeenCalled();
    expect(notifyCompleted).not.toHaveBeenCalled();
  });

  test('arrived -> arrived does not resend arrived SMS', async () => {
    const { handlers, notifyArrived } = loadStatusHandlers({ prevStatus: 'arrived' });

    await handlers.applyArrived(7, 'Sarah', { ip: '127.0.0.1' });

    expect(notifyArrived).not.toHaveBeenCalled();
  });

  test('status update still succeeds when SMS notifier throws', async () => {
    const notifyArrived = jest.fn(async () => {
      throw new Error('sms down');
    });

    jest.resetModules();
    jest.doMock('../src/features/_shared/entry', () => ({
      load: jest.fn(async () => ({
        entryid: 7,
        registrationid: 42,
        position: 2,
        status: 'waiting',
      })),
      notFound: () => {
        const err = new Error('Queue entry not found');
        err.status = 404;
        return err;
      },
    }));
    jest.doMock('../src/features/arrived/mysql', () => ({ apply: jest.fn(async () => {}) }));
    jest.doMock('../src/features/arrived/redis', () => ({ apply: jest.fn(async () => {}) }));
    jest.doMock('../src/ws/broadcast', () => ({
      recalcAndBroadcast: jest.fn(async () => ({ entries: [] })),
    }));
    jest.doMock('../src/features/_shared/store-health', () => ({
      canUseRedis: jest.fn(async () => true),
      canUseMysql: jest.fn(async () => true),
      isTemporaryEntryId: jest.fn(() => false),
    }));
    jest.doMock('../src/features/_shared/mysql-outbox', () => ({
      processOutbox: jest.fn(async () => ({ processed: 0, pending: 0 })),
    }));
    jest.doMock('../src/utils/audit', () => ({ buildAuditRecord: jest.fn(() => ({ timestamp: 't' })) }));
    jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
    jest.doMock('../src/features/waiting/queueJoinSms', () => ({ notifyQueueJoined: jest.fn(async () => {}) }));
    jest.doMock('../src/features/arrived/arrivedSms', () => ({ notifyArrived }));
    jest.doMock('../src/features/roomed/roomedSms', () => ({ notifyRoomed: jest.fn(async () => {}) }));
    jest.doMock('../src/features/completed/completedSms', () => ({ notifyCompleted: jest.fn(async () => {}) }));
    jest.doMock('../src/features/_shared/registrationContact', () => ({
      loadRegistrationContact: jest.fn(async () => ({ phone: '+15551234567', sms_opt_in: true })),
    }));

    let applyArrived;
    jest.isolateModules(() => {
      applyArrived = require('../src/bus').__testables.applyArrived;
    });

    await expect(applyArrived(7, 'Sarah', { ip: '127.0.0.1' })).resolves.toMatchObject({
      entryid: 7,
      status: 'arrived',
    });
  });
});
