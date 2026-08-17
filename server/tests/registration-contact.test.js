jest.mock('../src/db/mysql', () => ({
  query: jest.fn(),
}));

const { query } = require('../src/db/mysql');
const {
  loadRegistrationContact,
  loadRegistrationContacts,
} = require('../src/features/_shared/registrationContact');

describe('registrationContact', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('returns phone and sms_opt_in map for valid registration IDs', async () => {
    query.mockResolvedValueOnce([
      { registrationid: 10, phone: '+15551110001', sms_opt_in: 1 },
      { registrationid: 11, phone: '+15551110002', sms_opt_in: 0 },
    ]);

    const contacts = await loadRegistrationContacts([10, 11]);

    expect(contacts.get(10)).toEqual({ phone: '+15551110001', sms_opt_in: true });
    expect(contacts.get(11)).toEqual({ phone: '+15551110002', sms_opt_in: false });
  });

  test('filters invalid registration IDs and deduplicates input', async () => {
    query.mockResolvedValueOnce([
      { registrationid: 10, phone: '+15551110001', sms_opt_in: 1 },
    ]);

    await loadRegistrationContacts([10, 10, -1, 0, NaN]);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE registrationid IN (?)'),
      [10]
    );
  });

  test('returns empty map when no valid IDs are provided', async () => {
    const contacts = await loadRegistrationContacts([-3, 0]);
    expect(contacts.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  test('returns empty map when query fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'));

    const contacts = await loadRegistrationContacts([10]);
    expect(contacts.size).toBe(0);
  });

  test('loadRegistrationContact returns null when registration is missing', async () => {
    query.mockResolvedValueOnce([]);

    await expect(loadRegistrationContact(999)).resolves.toBeNull();
  });
});
