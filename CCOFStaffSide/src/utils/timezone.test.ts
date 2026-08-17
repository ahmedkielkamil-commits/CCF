import { describe, expect, test } from 'vitest';
import { getClientTimezone } from './timezone';

describe('getClientTimezone', () => {
  test('returns a non-empty timezone string', () => {
    expect(getClientTimezone().length).toBeGreaterThan(0);
  });
});
