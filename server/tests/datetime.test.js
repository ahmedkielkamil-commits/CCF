const {
  formatDbDatetimeForApi,
  normalizeRedisEntry,
  normalizeTimestamp,
} = require('../src/utils/datetime');

describe('formatDbDatetimeForApi', () => {
  test('serializes UTC Date values without local offset drift', () => {
    const value = new Date('2026-08-17T19:22:25.000Z');
    expect(formatDbDatetimeForApi(value)).toBe('2026-08-17T19:22:25.000Z');
  });

  test('parses naive MySQL datetime strings as UTC', () => {
    expect(formatDbDatetimeForApi('2026-08-17 19:22:25')).toBe('2026-08-17T19:22:25.000Z');
  });

  test('parses naive ISO Redis strings as UTC', () => {
    expect(normalizeTimestamp('2026-08-17T19:22:25')).toBe('2026-08-17T19:22:25.000Z');
  });

  test('normalizes redis entry payloads on write', () => {
    expect(
      normalizeRedisEntry({
        entryid: 1,
        checked_in_at: '2026-08-17T19:22:25',
        position: 1,
        status: 'waiting',
      }).checked_in_at
    ).toBe('2026-08-17T19:22:25.000Z');
  });
});
