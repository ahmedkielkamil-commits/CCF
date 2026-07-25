jest.mock('../src/db/mysql', () => ({
  query: jest.fn(),
}));

jest.mock('../src/features/_shared/store-health', () => ({
  canUseMysql: jest.fn(),
}));

const { query } = require('../src/db/mysql');
const { canUseMysql } = require('../src/features/_shared/store-health');
const { getUsageReport, median, hourLabel } = require('../src/features/_shared/usage-analytics');

describe('usage analytics helpers', () => {
  test('median returns middle value', () => {
    expect(median([40, 20, 30])).toBe(30);
    expect(median([40, 30])).toBe(35);
    expect(median([])).toBeNull();
  });

  test('hourLabel formats clinic hours', () => {
    expect(hourLabel(9)).toBe('9 AM');
    expect(hourLabel(14)).toBe('2 PM');
    expect(hourLabel(0)).toBe('12 AM');
    expect(hourLabel(12)).toBe('12 PM');
  });
});

describe('getUsageReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canUseMysql.mockResolvedValue(true);
  });

  test('aggregates peak hours, funnel, and no-show rate', async () => {
    query
      .mockResolvedValueOnce([
        { hour: 9, families: 4 },
        { hour: 10, families: 6 },
        { hour: 15, families: 5 },
      ])
      .mockResolvedValueOnce([
        { day: '2026-07-10', families: 3, children: 4 },
        { day: '2026-07-11', families: 5, children: 7 },
      ])
      .mockResolvedValueOnce([{ minutes: 30 }, { minutes: 50 }, { minutes: 40 }])
      .mockResolvedValueOnce([{
        joined: 20,
        reached_clinic: 16,
        roomed: 14,
        completed: 12,
      }])
      .mockResolvedValueOnce([{
        total_no_show: 3,
        parent_cancel: 1,
        staff_no_show: 2,
        total_entries: 20,
      }])
      .mockResolvedValueOnce([{ families: 2, children: 3 }])
      .mockResolvedValueOnce([{ families: 8, children: 11 }]);

    const report = await getUsageReport({ days: 14 });

    expect(report.days).toBe(14);
    expect(report.summary.totalFamilies).toBe(8);
    expect(report.summary.totalChildren).toBe(11);
    expect(report.summary.medianJoinToRoomMinutes).toBe(40);
    expect(report.summary.noShowRate).toBe(15);
    expect(report.summary.noShowParentCancel).toBe(1);
    expect(report.funnel.joined).toBe(20);
    expect(report.funnel.completed).toBe(12);
    expect(report.peakHours.find((row) => row.hour === 10)?.families).toBe(6);
    expect(report.dailyUsage).toHaveLength(2);
  });

  test('throws when mysql is unavailable', async () => {
    canUseMysql.mockResolvedValueOnce(false);
    await expect(getUsageReport()).rejects.toMatchObject({ status: 503 });
  });
});
