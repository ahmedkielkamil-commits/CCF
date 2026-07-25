import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from './LandingPage';

const mockNavigate = vi.fn();

vi.mock('../hooks/useQueue', () => ({
  useQueue: () => ({
    queue: { entries: [], roomingInterval: { minutes: 15 }, updatedAt: '2026-01-01T00:00:00.000Z' },
    loading: false,
    error: null,
    setQueue: vi.fn(),
  }),
}));

vi.mock('../api/queue', () => ({
  fetchWaitInterval: vi.fn(async () => ({ minutes: 15 })),
  fetchClinicHours: vi.fn(async () => ({ hours: '8:00 AM - 5:00 PM' })),
}));

vi.mock('../utils/form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/form')>();
  return {
    ...actual,
    getEstimatedWaitIfJoinNow: vi.fn(() => '15-30 min'),
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('LandingPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    localStorage.clear();
  });

  test('stores resume code and navigates to status', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    await user.type(screen.getByPlaceholderText('e.g. 4829JD'), '4829JD');
    await user.click(screen.getByRole('button', { name: 'View My Status' }));

    expect(localStorage.getItem('ccof_resume_token')).toBe('4829JD');
    expect(mockNavigate).toHaveBeenCalledWith('/status');
  });
});
