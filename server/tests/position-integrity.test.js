function makeInMemoryRedis() {
  const state = {
    live: new Map(),
    kv: new Map(),
    outbox: [],
  };

  const client = {
    isOpen: true,
    on: jest.fn(),
    get: jest.fn(async (key) => state.kv.get(key) ?? null),
    set: jest.fn(async (key, value) => {
      state.kv.set(key, value);
      return 'OK';
    }),
    setEx: jest.fn(async (key, _ttl, value) => {
      state.kv.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      let removed = 0;
      for (const key of list) {
        if (key === 'queue:live') {
          removed += state.live.size ? 1 : 0;
          state.live.clear();
          continue;
        }
        if (state.kv.delete(key)) removed += 1;
      }
      return removed;
    }),
    zAdd: jest.fn(async (_key, entry) => {
      state.live.set(String(entry.value), Number(entry.score));
      return 1;
    }),
    zRem: jest.fn(async (_key, value) => {
      return state.live.delete(String(value)) ? 1 : 0;
    }),
    zScore: jest.fn(async (_key, value) => {
      const score = state.live.get(String(value));
      return score == null ? null : score;
    }),
    zRangeWithScores: jest.fn(async () =>
      [...state.live.entries()]
        .map(([value, score]) => ({ value, score }))
        .sort((a, b) => a.score - b.score || Number(a.value) - Number(b.value))
    ),
    multi: jest.fn(() => {
      const ops = [];
      return {
        zAdd(entryKey, entry) {
          ops.push(() => client.zAdd(entryKey, entry));
          return this;
        },
        zRem(entryKey, value) {
          ops.push(() => client.zRem(entryKey, value));
          return this;
        },
        set(key, value) {
          ops.push(() => client.set(key, value));
          return this;
        },
        del(key) {
          ops.push(() => client.del(key));
          return this;
        },
        setEx(key, ttl, value) {
          ops.push(() => client.setEx(key, ttl, value));
          return this;
        },
        async exec() {
          for (const op of ops) {
            await op();
          }
          return [];
        },
      };
    }),
    lLen: jest.fn(async () => state.outbox.length),
    lIndex: jest.fn(async (_key, idx) => (idx === 0 ? state.outbox[0] ?? null : null)),
    lPop: jest.fn(async () => state.outbox.shift() ?? null),
    rPush: jest.fn(async (_key, value) => {
      state.outbox.push(value);
      return state.outbox.length;
    }),
    ttl: jest.fn(async () => -1),
    scanIterator: jest.fn(async function* scanIterator({ MATCH }) {
      const prefix = MATCH.replace('*', '');
      for (const key of state.kv.keys()) {
        if (key.startsWith(prefix)) yield key;
      }
    }),
  };

  return { client, state };
}

describe('position integrity checks', () => {
  test('positions remain contiguous after Redis queue removal', async () => {
    jest.resetModules();
    const { client, state } = makeInMemoryRedis();
    state.live.set('1', 1);
    state.live.set('2', 2);
    state.live.set('3', 3);
    state.kv.set('queue:entry:1', JSON.stringify({ entryid: 1, position: 1, status: 'waiting' }));
    state.kv.set('queue:entry:2', JSON.stringify({ entryid: 2, position: 2, status: 'waiting' }));
    state.kv.set('queue:entry:3', JSON.stringify({ entryid: 3, position: 3, status: 'waiting' }));

    jest.doMock('../src/db/redis', () => ({ client }));
    let remove;
    jest.isolateModules(() => {
      ({ remove } = require('../src/features/_shared/removal-redis'));
    });

    await remove(2, 2);

    const members = await client.zRangeWithScores('queue:live', 0, -1);
    expect(members).toEqual([
      { value: '1', score: 1 },
      { value: '3', score: 2 },
    ]);
    const updated = JSON.parse(state.kv.get('queue:entry:3'));
    expect(updated.position).toBe(2);
  });

  test('MySQL/Redis positions re-align after outbox replay and reseed', async () => {
    jest.resetModules();
    jest.dontMock('../src/db/redis');
    const { client, state } = makeInMemoryRedis();
    let mysqlRows = [
      {
        entryid: 1, registrationid: 10, fname: 'A', lname: 'A', symptoms: 'x', checked_in_at: '2026-01-01T00:00:00.000Z', position: 1, status: 'waiting',
      },
      {
        entryid: 2, registrationid: 11, fname: 'B', lname: 'B', symptoms: 'y', checked_in_at: '2026-01-01T00:00:00.000Z', position: 2, status: 'waiting',
      },
    ];
    state.outbox.push(
      JSON.stringify({ type: 'status_update', status: 'roomed', entryId: 1, removedPosition: 1, audit: {} })
    );

    jest.doMock('redis', () => ({ createClient: jest.fn(() => client) }));
    jest.doMock('../src/features/_shared/sync-mysql', () => ({
      liveEntries: jest.fn(async () => mysqlRows),
    }));
    jest.doMock('../src/features/_shared/store-health', () => ({
      canUseMysql: jest.fn(async () => true),
      canUseRedis: jest.fn(async () => true),
    }));
    const roomedMysql = { apply: jest.fn(async () => {}), shift: jest.fn(async () => {}) };
    jest.doMock('../src/features/roomed/mysql', () => roomedMysql);
    jest.doMock('../src/features/waiting/mysql', () => ({ insert: jest.fn() }));
    jest.doMock('../src/features/arrived/mysql', () => ({ apply: jest.fn() }));
    jest.doMock('../src/features/completed/mysql', () => ({ apply: jest.fn() }));
    jest.doMock('../src/features/no_show/mysql', () => ({ apply: jest.fn(), shift: jest.fn() }));
    jest.doMock('../src/bus/hipaa/safeLog', () => ({
      safeLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));

    let reseedLiveQueueFromMysql;
    let processOutbox;
    jest.isolateModules(() => {
      ({ reseedLiveQueueFromMysql } = require('../src/db/redis'));
      ({ processOutbox } = require('../src/features/_shared/mysql-outbox'));
    });

    await reseedLiveQueueFromMysql('initial');
    await processOutbox();

    mysqlRows = [
      {
        entryid: 2, registrationid: 11, fname: 'B', lname: 'B', symptoms: 'y', checked_in_at: '2026-01-01T00:00:00.000Z', position: 1, status: 'waiting',
      },
    ];
    await reseedLiveQueueFromMysql('after_replay');

    const members = await client.zRangeWithScores('queue:live', 0, -1);
    expect(members).toEqual([{ value: '2', score: 1 }]);
    expect(roomedMysql.apply).toHaveBeenCalledWith(1, {});
    expect(roomedMysql.shift).toHaveBeenCalledWith(1);
  });
});
