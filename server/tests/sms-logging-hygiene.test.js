function collectLogArgs(safeLog) {
  return [
    ...safeLog.info.mock.calls,
    ...safeLog.warn.mock.calls,
    ...safeLog.error.mock.calls,
  ].flatMap((call) => call);
}

function containsPhone(value, phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (typeof value === 'string') {
    return value.includes(phone) || value.includes(digits);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => containsPhone(entry, phone));
  }
  return false;
}

describe('SMS logging hygiene', () => {
  test('notifyArrived logs do not include phone numbers or parent names', async () => {
    jest.resetModules();

    const sendSMS = jest.fn(async () => ({ sid: 'SM123' }));
    const safeLog = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };

    jest.doMock('../src/features/arrived/twilio', () => ({
      sendSMS,
      isConfigured: () => true,
    }));
    jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog }));

    let notifyArrived;
    jest.isolateModules(() => {
      notifyArrived = require('../src/features/arrived/arrivedSms').notifyArrived;
    });

    await notifyArrived({ phone: '+15551234567', sms_opt_in: true });

    for (const arg of collectLogArgs(safeLog)) {
      expect(containsPhone(arg, '+15551234567')).toBe(false);
      expect(String(arg)).not.toContain('Jane');
    }
  });

  test('notifyArrived failure logs only generic Twilio error message', async () => {
    jest.resetModules();

    const sendSMS = jest.fn(async () => {
      const err = new Error('Twilio unavailable');
      err.to = '+15551234567';
      throw err;
    });
    const safeLog = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };

    jest.doMock('../src/features/arrived/twilio', () => ({
      sendSMS,
      isConfigured: () => true,
    }));
    jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog }));

    let notifyArrived;
    jest.isolateModules(() => {
      notifyArrived = require('../src/features/arrived/arrivedSms').notifyArrived;
    });

    await notifyArrived({ phone: '+15551234567', sms_opt_in: true });

    expect(safeLog.warn).toHaveBeenCalledWith('Arrived SMS failed', {
      message: 'Twilio unavailable',
    });

    for (const arg of collectLogArgs(safeLog)) {
      expect(containsPhone(arg, '+15551234567')).toBe(false);
    }
  });
});
