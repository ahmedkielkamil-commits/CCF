const {
  resolveTimezone,
  getLocalDayUtcBounds,
  isValidTimezone,
  rememberClientTimezone,
  getActiveTimezone,
  runWithTimezone,
} = require('../src/utils/timezone');

describe('timezone utilities', () => {
  test('accepts valid IANA timezones from clients', () => {
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(resolveTimezone('America/Chicago')).toBe('America/Chicago');
  });

  test('falls back when client timezone is invalid', () => {
    expect(resolveTimezone('Not/AZone')).toBe('America/New_York');
    expect(resolveTimezone('')).toBe('America/New_York');
  });

  test('computes local day bounds for a timezone', () => {
    const ref = new Date('2026-08-17T19:30:00.000Z');
    const { start, end } = getLocalDayUtcBounds('America/New_York', ref);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(start.toISOString()).toBe('2026-08-17T04:00:00.000Z');
  });

  test('uses request-scoped timezone when present', () => {
    rememberClientTimezone('America/Chicago');
    runWithTimezone('America/Denver', () => {
      expect(getActiveTimezone()).toBe('America/Denver');
    });
  });
});
