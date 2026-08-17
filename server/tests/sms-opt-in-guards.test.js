function loadNotifier(modulePath, twilioPath, exportName) {
  jest.resetModules();

  const sendSMS = jest.fn(async () => ({ sid: 'SM123' }));
  const isConfigured = jest.fn(() => true);
  const safeLog = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };

  jest.doMock(twilioPath, () => ({ sendSMS, isConfigured }));
  jest.doMock('../src/bus/hipaa/safeLog', () => ({ safeLog }));

  let notifier;
  jest.isolateModules(() => {
    notifier = require(modulePath)[exportName];
  });

  return { notifier, sendSMS, isConfigured, safeLog };
}

const contact = { phone: '+15551234567', sms_opt_in: true };

describe('SMS opt-in and configuration guards', () => {
  test('notifyQueueJoined skips when sms_opt_in is false', async () => {
    const { notifier, sendSMS } = loadNotifier(
      '../src/features/waiting/queueJoinSms',
      '../src/features/waiting/twilio',
      'notifyQueueJoined'
    );

    await notifier({
      body: {
        parent_fname: 'Jane',
        parent_lname: 'Doe',
        phone: '+15551234567',
        sms_opt_in: false,
        children: [{ fname: 'Amy', lname: 'Doe' }],
      },
      entries: [{ entryid: 1, position: 1, status: 'waiting' }],
      resumeCode: '4829',
    });

    expect(sendSMS).not.toHaveBeenCalled();
  });

  test('notifyQueueJoined skips when Twilio is not configured', async () => {
    const { notifier, sendSMS, isConfigured, safeLog } = loadNotifier(
      '../src/features/waiting/queueJoinSms',
      '../src/features/waiting/twilio',
      'notifyQueueJoined'
    );
    isConfigured.mockReturnValue(false);

    await notifier({
      body: {
        parent_fname: 'Jane',
        parent_lname: 'Doe',
        phone: '+15551234567',
        sms_opt_in: true,
        children: [{ fname: 'Amy', lname: 'Doe' }],
      },
      entries: [{ entryid: 1, position: 1, status: 'waiting' }],
      resumeCode: '4829',
    });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(safeLog.warn).toHaveBeenCalledWith('Queue join SMS skipped: Twilio not configured');
  });

  test.each([
    ['notifyArrived', '../src/features/arrived/arrivedSms', '../src/features/arrived/twilio'],
    ['notifyRoomed', '../src/features/roomed/roomedSms', '../src/features/roomed/twilio'],
    ['notifyCompleted', '../src/features/completed/completedSms', '../src/features/completed/twilio'],
  ])('%s skips when sms_opt_in is false', async (exportName, modulePath, twilioPath) => {
    const { notifier, sendSMS } = loadNotifier(modulePath, twilioPath, exportName);
    await notifier({ ...contact, sms_opt_in: false });
    expect(sendSMS).not.toHaveBeenCalled();
  });

  test.each([
    ['notifyArrived', '../src/features/arrived/arrivedSms', '../src/features/arrived/twilio', 'Arrived'],
    ['notifyRoomed', '../src/features/roomed/roomedSms', '../src/features/roomed/twilio', 'Roomed'],
    ['notifyCompleted', '../src/features/completed/completedSms', '../src/features/completed/twilio', 'Completed'],
  ])('%s skips when Twilio is not configured', async (exportName, modulePath, twilioPath, label) => {
    const { notifier, sendSMS, isConfigured, safeLog } = loadNotifier(modulePath, twilioPath, exportName);
    isConfigured.mockReturnValue(false);

    await notifier(contact);

    expect(sendSMS).not.toHaveBeenCalled();
    expect(safeLog.warn).toHaveBeenCalledWith(`${label} SMS skipped: Twilio not configured`);
  });

  test('sendPositionNotification skips when sms_opt_in is false', async () => {
    const { notifier, sendSMS } = loadNotifier(
      '../src/features/_shared/positionSms',
      '../src/features/waiting/twilio',
      'sendPositionNotification'
    );

    await notifier('+15551234567', 2, false);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  test('notifyArrived swallows Twilio failures without throwing', async () => {
    const { notifier, sendSMS, safeLog } = loadNotifier(
      '../src/features/arrived/arrivedSms',
      '../src/features/arrived/twilio',
      'notifyArrived'
    );
    sendSMS.mockRejectedValueOnce(new Error('Twilio unavailable'));

    await expect(notifier(contact)).resolves.toBeUndefined();
    expect(safeLog.warn).toHaveBeenCalledWith('Arrived SMS failed', {
      message: 'Twilio unavailable',
    });
  });
});
