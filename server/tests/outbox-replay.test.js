function loadOutboxWithQueue(queueItems) {
  jest.resetModules();

  const queue = [...queueItems];
  const client = {
    rPush: jest.fn(async (_key, value) => {
      queue.push(value);
      return queue.length;
    }),
    lIndex: jest.fn(async (_key, index) => (index === 0 ? queue[0] ?? null : null)),
    lPop: jest.fn(async () => queue.shift() ?? null),
    lLen: jest.fn(async () => queue.length),
    zScore: jest.fn(async () => 1),
    get: jest.fn(async () => JSON.stringify({ entryid: -1, registrationid: -1, status: 'waiting' })),
    multi: jest.fn(() => ({
      zRem: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setEx: jest.fn().mockReturnThis(),
      exec: jest.fn(async () => []),
    })),
    ttl: jest.fn(async () => -1),
    del: jest.fn(async () => 1),
    setEx: jest.fn(async () => 'OK'),
  };

  const waitingMysql = { insert: jest.fn(async () => ({ registrationid: 10, entries: [{ entryid: 20 }] })) };
  const arrivedMysql = { apply: jest.fn(async () => {}) };
  const completedMysql = { apply: jest.fn(async () => {}) };
  const roomedMysql = { apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) };
  const noShowMysql = { apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) };

  jest.doMock('../src/db/redis', () => ({ client }));
  jest.doMock('../src/features/waiting/mysql', () => waitingMysql);
  jest.doMock('../src/features/arrived/mysql', () => arrivedMysql);
  jest.doMock('../src/features/completed/mysql', () => completedMysql);
  jest.doMock('../src/features/roomed/mysql', () => roomedMysql);
  jest.doMock('../src/features/no_show/mysql', () => noShowMysql);
  jest.doMock('../src/features/_shared/store-health', () => ({
    canUseMysql: jest.fn(async () => true),
    canUseRedis: jest.fn(async () => true),
  }));
  jest.doMock('../src/bus/hipaa/safeLog', () => ({
    safeLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  }));

  let api;
  jest.isolateModules(() => {
    api = require('../src/features/_shared/mysql-outbox');
  });

  return {
    ...api,
    queue,
    mocks: { arrivedMysql, completedMysql, roomedMysql, noShowMysql, waitingMysql, client },
  };
}

describe('outbox replay behavior', () => {
  test('replay ordering is preserved', async () => {
    const first = JSON.stringify({ type: 'status_update', status: 'arrived', entryId: 1, audit: {} });
    const second = JSON.stringify({ type: 'status_update', status: 'completed', entryId: 1, audit: {} });
    const ctx = loadOutboxWithQueue([first, second]);

    const result = await ctx.processOutbox();
    expect(result.pending).toBe(0);
    expect(ctx.mocks.arrivedMysql.apply).toHaveBeenCalled();
    expect(ctx.mocks.completedMysql.apply).toHaveBeenCalled();
    expect(ctx.mocks.arrivedMysql.apply.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.mocks.completedMysql.apply.mock.invocationCallOrder[0]
    );
  });

  test('malformed outbox payload is dropped safely', async () => {
    const bad = '{ not-json';
    const good = JSON.stringify({ type: 'status_update', status: 'arrived', entryId: 2, audit: {} });
    const ctx = loadOutboxWithQueue([bad, good]);

    const result = await ctx.processOutbox();
    expect(result.pending).toBe(0);
    expect(ctx.mocks.client.lPop).toHaveBeenCalledTimes(2);
    expect(ctx.mocks.arrivedMysql.apply).toHaveBeenCalledTimes(1);
  });

  test('partial replay failure retries without data loss', async () => {
    const event = JSON.stringify({ type: 'status_update', status: 'arrived', entryId: 9, audit: {} });
    const ctx = loadOutboxWithQueue([event]);

    ctx.mocks.arrivedMysql.apply.mockRejectedValueOnce(new Error('mysql transient'));
    let result = await ctx.processOutbox();
    expect(result.processed).toBe(0);
    expect(result.pending).toBe(1);
    expect(ctx.queue).toHaveLength(1);

    ctx.mocks.arrivedMysql.apply.mockResolvedValueOnce();
    result = await ctx.processOutbox();
    expect(result.processed).toBe(1);
    expect(result.pending).toBe(0);
    expect(ctx.queue).toHaveLength(0);
  });
});
