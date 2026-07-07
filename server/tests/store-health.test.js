jest.mock('../src/db/redis', () => ({
  client: {
    isOpen: true,
    ping: jest.fn(),
  },
}));

jest.mock('../src/db/mysql', () => ({
  query: jest.fn(),
}));

const { client } = require('../src/db/redis');
const { query } = require('../src/db/mysql');
const {
  canUseRedis,
  canUseMysql,
  isTemporaryEntryId,
  isTemporaryRegistrationId,
} = require('../src/features/_shared/store-health');

describe('store-health', () => {
  test('returns false when redis client is closed', async () => {
    client.isOpen = false;
    await expect(canUseRedis()).resolves.toBe(false);
    expect(client.ping).not.toHaveBeenCalled();
  });

  test('returns true when redis ping works', async () => {
    client.isOpen = true;
    client.ping.mockResolvedValueOnce('PONG');
    await expect(canUseRedis()).resolves.toBe(true);
  });

  test('returns false when mysql probe query fails', async () => {
    query.mockRejectedValueOnce(new Error('mysql down'));
    await expect(canUseMysql()).resolves.toBe(false);
  });

  test('temporary IDs are negative numbers', () => {
    expect(isTemporaryEntryId(-1)).toBe(true);
    expect(isTemporaryEntryId(1)).toBe(false);
    expect(isTemporaryRegistrationId(-100)).toBe(true);
    expect(isTemporaryRegistrationId(100)).toBe(false);
  });
});
