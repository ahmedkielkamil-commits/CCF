const { query } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  query: jest.fn(),
}));

jest.mock('../src/db/redis', () => ({
  client: {
    isOpen: true,
    zRangeWithScores: jest.fn(async () => []),
    get: jest.fn(async () => null),
  },
}));

jest.mock('../src/features/_shared/waitTime', () => ({
  getEstimatedWait: jest.fn(() => '15 min'),
  getTime: jest.fn(async () => ({ minutes: 15, source: 'default' })),
}));

jest.mock('../src/features/_shared/store-health', () => ({
  canUseRedis: jest.fn(async () => true),
  canUseMysql: jest.fn(async () => true),
}));

describe('buildQueuePayload inRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes roomed patients in inRoom separate from live entries', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes("q.status IN ('waiting', 'arrived')")) {
        return [
          {
            entryid: 1,
            registrationid: 10,
            fname: 'Amy',
            lname: 'Doe',
            symptoms: 'Fever',
            position: 1,
            status: 'waiting',
            parent_fname: 'Jane',
            parent_lname: 'Doe',
            checked_in_at: new Date('2026-07-05T12:00:00.000Z'),
          },
        ];
      }
      if (sql.includes("q.status = 'roomed'")) {
        return [
          {
            entryid: 2,
            registrationid: 11,
            fname: 'Ben',
            lname: 'Lee',
            symptoms: 'Cough',
            position: 3,
            status: 'roomed',
            parent_fname: 'Kim',
            parent_lname: 'Lee',
            checked_in_at: new Date('2026-07-05T11:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM registration')) {
        return [
          {
            registrationid: 10,
            parent_fname: 'Jane',
            parent_lname: 'Doe',
            checked_in_at: new Date('2026-07-05T12:00:00.000Z'),
          },
        ];
      }
      return [];
    });

    const { buildQueuePayload } = require('../src/ws/broadcast');
    const payload = await buildQueuePayload();

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].entryid).toBe(1);
    expect(payload.inRoom).toHaveLength(1);
    expect(payload.inRoom[0]).toMatchObject({
      entryid: 2,
      status: 'roomed',
      fname: 'Ben',
      estimatedWait: '—',
    });
  });
});
