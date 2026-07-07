jest.mock('../src/features/_shared/sync-mysql', () => ({
  liveEntries: jest.fn(),
}));

jest.mock('../src/features/_shared/sync-redis', () => ({
  liveEntries: jest.fn(),
}));

const mysql = require('../src/features/_shared/sync-mysql');
const redis = require('../src/features/_shared/sync-redis');
const { getSyncReport } = require('../src/features/_shared/sync');

describe('getSyncReport', () => {
  test('reports inSync true when mysql and redis live rows match', async () => {
    const rows = [
      { entryid: 1, position: 1, status: 'waiting', fname: 'A', lname: 'B' },
      { entryid: 2, position: 2, status: 'arrived', fname: 'C', lname: 'D' },
    ];
    mysql.liveEntries.mockResolvedValueOnce(rows);
    redis.liveEntries.mockResolvedValueOnce(rows);

    const report = await getSyncReport();

    expect(report.live.inSync).toBe(true);
    expect(report.live.mismatchCount).toBe(0);
    expect(report.mysql.liveCount).toBe(2);
    expect(report.redis.liveCount).toBe(2);
  });

  test('reports infra mismatch when redis is unavailable', async () => {
    mysql.liveEntries.mockResolvedValueOnce([]);
    redis.liveEntries.mockRejectedValueOnce(new Error('redis unreachable'));

    const report = await getSyncReport();

    expect(report.live.inSync).toBe(false);
    expect(report.live.mismatchCount).toBe(1);
    expect(report.live.mismatches[0].issue).toMatch(/Redis unavailable/);
  });
});
