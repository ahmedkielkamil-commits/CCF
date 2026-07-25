const {
  formatDisplayCode,
  parseResumeCodeInput,
  parentInitials,
} = require('../src/features/_shared/resume-token');

describe('resume access code', () => {
  test('parentInitials uses first letters of parent name', () => {
    expect(parentInitials('Jane', 'Doe')).toBe('JD');
    expect(parentInitials('mary', 'smith')).toBe('MS');
  });

  test('formatDisplayCode combines 4 digits with initials', () => {
    expect(formatDisplayCode('4829', 'JD')).toBe('4829JD');
  });

  test('parseResumeCodeInput accepts digits with optional initials', () => {
    expect(parseResumeCodeInput('4829JD')).toEqual({ lookupCode: '4829' });
    expect(parseResumeCodeInput('4829')).toEqual({ lookupCode: '4829' });
    expect(parseResumeCodeInput('123456')).toEqual({ lookupCode: '123456', legacy: true });
  });
});
