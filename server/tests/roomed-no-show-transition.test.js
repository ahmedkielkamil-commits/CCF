function loadNoShowHandler({ prevStatus = 'roomed' } = {}) {
  jest.resetModules();

  const noShowMysql = { apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) };
  const noShowRedis = { remove: jest.fn(async () => {}) };
  const cleanupIfRegistrationNotLive = jest.fn(async () => {});

  jest.doMock('../src/features/_shared/entry', () => ({
    load: jest.fn(async () => ({
      entryid: 5,
      registrationid: 20,
      position: 4,
      status: prevStatus,
    })),
    notFound: () => {
      const err = new Error('Queue entry not found');
      err.status = 404;
      return err;
    },
  }));
  jest.doMock('../src/features/no_show/mysql', () => noShowMysql);
  jest.doMock('../src/features/no_show/redis', () => noShowRedis);
  jest.doMock('../src/features/_shared/resume-token', () => ({ cleanupIfRegistrationNotLive }));
  jest.doMock('../src/features/_shared/mysql-outbox', () => ({
    processOutbox: jest.fn(async () => {}),
    enqueueStatusUpdate: jest.fn(async () => {}),
  }));
  jest.doMock('../src/features/_shared/store-health', () => ({
    canUseMysql: jest.fn(async () => true),
    canUseRedis: jest.fn(async () => true),
    isTemporaryEntryId: jest.fn(() => false),
  }));
  jest.doMock('../src/ws/broadcast', () => ({
    recalcAndBroadcast: jest.fn(async () => ({ entries: [], inRoom: [] })),
  }));
  jest.doMock('../src/utils/audit', () => ({ buildAuditRecord: jest.fn(() => ({ timestamp: 't' })) }));

  let applyNoShow;
  jest.isolateModules(() => {
    applyNoShow = require('../src/bus').__testables.applyNoShow;
  });

  return { applyNoShow, noShowMysql, noShowRedis, cleanupIfRegistrationNotLive };
}

describe('applyNoShow from roomed', () => {
  test('does not shift queue or remove from redis when already roomed', async () => {
    const { applyNoShow, noShowMysql, noShowRedis, cleanupIfRegistrationNotLive } = loadNoShowHandler();
    const result = await applyNoShow(5, 'Sarah', {});

    expect(noShowMysql.apply).toHaveBeenCalledWith(5, expect.any(Object));
    expect(noShowMysql.shift).not.toHaveBeenCalled();
    expect(noShowRedis.remove).not.toHaveBeenCalled();
    expect(cleanupIfRegistrationNotLive).toHaveBeenCalledWith(20);
    expect(result.status).toBe('no_show');
  });

  test('still shifts queue when marking waiting entry as no show', async () => {
    const { applyNoShow, noShowMysql, noShowRedis } = loadNoShowHandler({ prevStatus: 'waiting' });
    await applyNoShow(5, 'Sarah', {});

    expect(noShowMysql.shift).toHaveBeenCalledWith(4);
    expect(noShowRedis.remove).toHaveBeenCalledWith(5, 4);
  });
});
