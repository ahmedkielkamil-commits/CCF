const mockClient = {
  isOpen: true,
  on: jest.fn(),
  ping: jest.fn(),
  connect: jest.fn(),
  quit: jest.fn(),
  del: jest.fn(),
  scanIterator: jest.fn(),
  multi: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockClient),
}));

jest.mock('../src/features/_shared/sync-mysql', () => ({
  liveEntries: jest.fn(),
}));

jest.mock('../src/bus/hipaa/safeLog', () => ({
  safeLog: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { liveEntries } = require('../src/features/_shared/sync-mysql');
const { reseedLiveQueueFromMysql } = require('../src/db/redis');

describe('Redis reseed on recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.isOpen = true;
    mockClient.scanIterator.mockImplementation(async function* scan() {
      yield 'queue:entry:1';
      yield 'queue:entry:2';
    });
  });

  test('rebuilds live queue keys from mysql rows', async () => {
    liveEntries.mockResolvedValueOnce([
      {
        entryid: 11,
        registrationid: 21,
        fname: 'Amy',
        lname: 'Doe',
        symptoms: 'Fever',
        checked_in_at: '2026-06-15T14:00:00.000Z',
        position: 1,
        status: 'waiting',
      },
    ]);

    const chain = {
      zAdd: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValueOnce([]),
    };
    mockClient.multi.mockReturnValueOnce(chain);

    const result = await reseedLiveQueueFromMysql('test');

    expect(result.seeded).toBe(true);
    expect(mockClient.del).toHaveBeenCalledWith(['queue:live', 'queue:entry:1', 'queue:entry:2']);
    expect(chain.zAdd).toHaveBeenCalled();
    expect(chain.set).toHaveBeenCalled();
    expect(chain.exec).toHaveBeenCalled();
  });

  test('skips reseed when mysql is unavailable', async () => {
    liveEntries.mockRejectedValueOnce(new Error('mysql down'));
    const result = await reseedLiveQueueFromMysql('test');
    expect(result).toEqual({ seeded: false, reason: 'mysql_unavailable' });
  });
});
