const { formatWaitRange } = require('../src/features/_shared/waitTime');

describe('waitTime formatting', () => {
  test('formatWaitRange keeps the lower bound on the left', () => {
    expect(formatWaitRange(80)).toBe('45 min - 60 min');
    expect(formatWaitRange(30)).toBe('30 min - 45 min');
  });
});
