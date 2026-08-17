const mockSendSMS = jest.fn(async () => ({ sid: 'SM123' }));
const mockIsConfigured = jest.fn(() => true);

jest.mock('../src/features/waiting/twilio', () => ({
  sendSMS: (...args) => mockSendSMS(...args),
  isConfigured: (...args) => mockIsConfigured(...args),
}));

jest.mock('../src/bus/hipaa/safeLog', () => ({
  safeLog: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const { sendPositionNotification } = require('../src/features/_shared/positionSms');

describe('position SMS thresholds', () => {
  beforeEach(() => {
    mockSendSMS.mockClear();
    mockIsConfigured.mockReturnValue(true);
  });

  test.each([
    [6, '5 patients ahead'],
    [4, '3 patients ahead'],
    [2, 'next in the queue'],
    [1, "your child's turn"],
  ])('position %i sends expected message', async (position, snippet) => {
    await sendPositionNotification('+15551234567', position, true);

    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(mockSendSMS.mock.calls[0][1]).toContain(snippet);
  });

  test.each([3, 5, 7])('position %i does not send SMS', async (position) => {
    await sendPositionNotification('+15551234567', position, true);
    expect(mockSendSMS).not.toHaveBeenCalled();
  });
});
