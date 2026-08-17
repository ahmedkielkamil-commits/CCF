jest.mock('../src/config/env', () => ({
  twilio: {
    accountSid: 'ACtest',
    authToken: 'test-token',
    from: '+18667382960',
  },
}));

const mockMessagesCreate = jest.fn(async () => ({ sid: 'SM123' }));

jest.mock('twilio', () => jest.fn(() => ({
  messages: { create: (...args) => mockMessagesCreate(...args) },
})));

describe('waiting/twilio phone normalization', () => {
  beforeEach(() => {
    jest.resetModules();
    mockMessagesCreate.mockClear();
  });

  test('normalizes 10-digit US numbers to E.164', () => {
    const { normalizePhoneForTwilio } = require('../src/features/waiting/twilio');
    expect(normalizePhoneForTwilio('5551234567')).toBe('+15551234567');
  });

  test('normalizes 11-digit numbers starting with 1', () => {
    const { normalizePhoneForTwilio } = require('../src/features/waiting/twilio');
    expect(normalizePhoneForTwilio('15551234567')).toBe('+15551234567');
  });

  test('preserves already normalized numbers', () => {
    const { normalizePhoneForTwilio } = require('../src/features/waiting/twilio');
    expect(normalizePhoneForTwilio('+15551234567')).toBe('+15551234567');
  });

  test('throws for empty phone values', () => {
    const { normalizePhoneForTwilio } = require('../src/features/waiting/twilio');
    expect(() => normalizePhoneForTwilio('')).toThrow('Invalid phone number');
  });

  test('sendSMS passes normalized recipient to Twilio', async () => {
    const { sendSMS } = require('../src/features/waiting/twilio');
    await sendSMS('5551234567', 'Test body');

    expect(mockMessagesCreate).toHaveBeenCalledWith({
      to: '+15551234567',
      from: '+18667382960',
      body: 'Test body',
    });
  });
});
