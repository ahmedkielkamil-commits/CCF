const { buildQueueJoinMessage } = require('../src/features/waiting/queueJoinSms');
const { buildArrivedMessage } = require('../src/features/arrived/arrivedSms');
const { buildRoomedMessage } = require('../src/features/roomed/roomedSms');
const { buildCompletedMessage } = require('../src/features/completed/completedSms');
const { buildPositionMessage } = require('../src/features/_shared/positionSms');

describe('SMS message copy', () => {
  test('buildQueueJoinMessage includes position and access code', () => {
    const message = buildQueueJoinMessage({
      body: { parent_fname: 'Jane', parent_lname: 'Doe', children: [{ fname: 'Amy', lname: 'Doe' }] },
      entries: [{ entryid: 1, position: 2, status: 'waiting' }],
      resumeCode: '4829',
    });

    expect(message).toContain("The Children's Clinic of Fredericksburg");
    expect(message).toContain('position 2');
    expect(message).toContain('4829JD');
    expect(message).toContain('Your access code is 4829JD');
  });

  test('buildQueueJoinMessage uses position range for multiple children', () => {
    const message = buildQueueJoinMessage({
      body: {
        parent_fname: 'Jane',
        parent_lname: 'Doe',
        children: [
          { fname: 'Amy', lname: 'Doe' },
          { fname: 'Tim', lname: 'Doe' },
        ],
      },
      entries: [
        { entryid: 1, position: 1, status: 'waiting' },
        { entryid: 2, position: 3, status: 'waiting' },
      ],
      resumeCode: '1234',
    });

    expect(message).toContain('positions 1-3');
  });

  test('buildArrivedMessage matches approved copy', () => {
    expect(buildArrivedMessage()).toBe(
      "This is a confirmation from The Children's Clinic of Fredericksburg. We have received your check-in and your child is now marked as arrived. Please ensure you are at the front desk so we can complete your check-in."
    );
  });

  test('buildRoomedMessage matches approved copy', () => {
    expect(buildRoomedMessage()).toBe(
      "A staff member at The Children's Clinic of Fredericksburg is ready for your child. Please make your way to the front desk now."
    );
  });

  test('buildCompletedMessage matches approved copy', () => {
    expect(buildCompletedMessage()).toBe(
      "Thank you for visiting The Children's Clinic of Fredericksburg. Your child's visit has been completed. We hope your child feels better soon. Please do not hesitate to contact us if you have any further concerns."
    );
  });

  test('buildPositionMessage returns threshold copy only for 6, 4, 2, and 1', () => {
    expect(buildPositionMessage(6)).toContain('5 patients ahead');
    expect(buildPositionMessage(4)).toContain('3 patients ahead');
    expect(buildPositionMessage(2)).toContain('next in the queue');
    expect(buildPositionMessage(1)).toContain("your child's turn");

    expect(buildPositionMessage(5)).toBeNull();
    expect(buildPositionMessage(3)).toBeNull();
    expect(buildPositionMessage(7)).toBeNull();
  });
});
