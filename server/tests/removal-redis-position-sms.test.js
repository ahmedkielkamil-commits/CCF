const { REDIS_KEYS } = require('../src/constants');

function makeInMemoryRedis(initialEntries) {
  const live = new Map();
  const kv = new Map();

  for (const entry of initialEntries) {
    live.set(String(entry.entryid), Number(entry.position));
    kv.set(REDIS_KEYS.entry(entry.entryid), JSON.stringify(entry));
  }

  const client = {
    zRem: jest.fn(async (_key, value) => (live.delete(String(value)) ? 1 : 0)),
    del: jest.fn(async (key) => (kv.delete(key) ? 1 : 0)),
    zRangeWithScores: jest.fn(async () =>
      [...live.entries()]
        .map(([value, score]) => ({ value, score }))
        .sort((a, b) => a.score - b.score || Number(a.value) - Number(b.value))
    ),
    get: jest.fn(async (key) => kv.get(key) ?? null),
    multi: jest.fn(() => {
      const ops = [];
      return {
        zAdd(_key, entry) {
          ops.push(() => {
            live.set(String(entry.value), Number(entry.score));
          });
          return this;
        },
        set(key, value) {
          ops.push(() => kv.set(key, value));
          return this;
        },
        async exec() {
          for (const op of ops) op();
          return [];
        },
      };
    }),
  };

  return { client, live, kv };
}

describe('removal-redis position SMS wiring', () => {
  const mockSendPositionNotification = jest.fn(async () => {});
  const mockLoadRegistrationContacts = jest.fn(async () => new Map());

  beforeEach(() => {
    jest.resetModules();
    mockSendPositionNotification.mockReset();
    mockSendPositionNotification.mockResolvedValue(undefined);
    mockLoadRegistrationContacts.mockReset();
  });

  function loadRemove(initialEntries) {
    const redis = makeInMemoryRedis(initialEntries);

    jest.doMock('../src/db/redis', () => ({ client: redis.client }));
    jest.doMock('../src/features/_shared/positionSms', () => ({
      sendPositionNotification: mockSendPositionNotification,
    }));
    jest.doMock('../src/features/_shared/registrationContact', () => ({
      loadRegistrationContacts: mockLoadRegistrationContacts,
    }));

    let remove;
    jest.isolateModules(() => {
      remove = require('../src/features/_shared/removal-redis').remove;
    });

    return { remove, redis };
  }

  test('notifies shifted entries at threshold positions after removal', async () => {
    mockLoadRegistrationContacts.mockResolvedValueOnce(
      new Map([[42, { phone: '+15551110001', sms_opt_in: true }]])
    );

    const { remove } = loadRemove([
      {
        entryid: 7,
        registrationid: 42,
        position: 7,
        fname: 'Amy',
        lname: 'Doe',
        status: 'waiting',
      },
    ]);

    await remove(3, 3);

    expect(mockSendPositionNotification).toHaveBeenCalledWith('+15551110001', 6, true);
  });

  test('does not notify when no entries shift', async () => {
    const { remove } = loadRemove([
      {
        entryid: 9,
        registrationid: 42,
        position: 1,
        fname: 'Amy',
        lname: 'Doe',
        status: 'waiting',
      },
    ]);

    await remove(9, 1);

    expect(mockSendPositionNotification).not.toHaveBeenCalled();
    expect(mockLoadRegistrationContacts).not.toHaveBeenCalled();
  });

  test('invokes position notifier for each shifted entry', async () => {
    mockLoadRegistrationContacts.mockResolvedValueOnce(
      new Map([[42, { phone: '+15551110001', sms_opt_in: true }]])
    );

    const { remove } = loadRemove([
      {
        entryid: 10,
        registrationid: 42,
        position: 5,
        fname: 'Amy',
        lname: 'Doe',
        status: 'waiting',
      },
      {
        entryid: 11,
        registrationid: 42,
        position: 6,
        fname: 'Tim',
        lname: 'Doe',
        status: 'waiting',
      },
    ]);

    await remove(3, 3);

    expect(mockSendPositionNotification).toHaveBeenCalledTimes(2);
    expect(mockSendPositionNotification).toHaveBeenCalledWith('+15551110001', 4, true);
    expect(mockSendPositionNotification).toHaveBeenCalledWith('+15551110001', 5, true);
  });

  test('skips entries without registration contact data', async () => {
    mockLoadRegistrationContacts.mockResolvedValueOnce(new Map());

    const { remove } = loadRemove([
      {
        entryid: 7,
        registrationid: 99,
        position: 7,
        fname: 'Amy',
        lname: 'Doe',
        status: 'waiting',
      },
    ]);

    await remove(3, 3);

    expect(mockSendPositionNotification).not.toHaveBeenCalled();
  });
});
