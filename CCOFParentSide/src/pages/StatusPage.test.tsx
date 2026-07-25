import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StatusPage } from './StatusPage';

const mockFetchParentResume = vi.fn();
const mockCancelParentCheckIn = vi.fn();

vi.mock('../api/queue', () => ({
  fetchParentResume: (...args: unknown[]) => mockFetchParentResume(...args),
  cancelParentCheckIn: (...args: unknown[]) => mockCancelParentCheckIn(...args),
  patchQueueStatus: vi.fn(async () => ({ entryid: 1, status: 'arrived' })),
}));

vi.mock('../hooks/useQueue', () => ({
  useQueue: () => ({
    queue: { entries: [], roomingInterval: { minutes: 15 }, updatedAt: '2026-01-01T00:00:00.000Z' },
    setQueue: vi.fn(),
  }),
}));

vi.mock('../context/CheckInContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/CheckInContext')>();
  return {
    ...actual,
    useCheckInDraft: () => ({ resetDraft: vi.fn() }),
  };
});

describe('StatusPage', () => {
  beforeEach(() => {
    localStorage.setItem('ccof_resume_token', 'tok-123');
    mockCancelParentCheckIn.mockReset();
    mockFetchParentResume.mockResolvedValue({
      registrationid: 10,
      resumeToken: 'tok-123',
      resumeCode: '4829JD',
      entries: [
        {
          entryid: 1,
          fname: 'Amy',
          lname: 'Doe',
          symptoms: 'Fever',
          position: 1,
          status: 'waiting',
          estimatedWait: '15 min - 30 min',
        },
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('cancels check-in and shows success message', async () => {
    const user = userEvent.setup();
    mockCancelParentCheckIn.mockResolvedValueOnce({ registrationid: 10, cancelledCount: 1, queue: { entries: [] } });

    render(
      <MemoryRouter initialEntries={['/status']}>
        <Routes>
          <Route path="/status" element={<StatusPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('All children added to the list.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel Check-In' }));

    await waitFor(() => {
      expect(screen.getByText('Your check-in has been cancelled.')).toBeInTheDocument();
    });
  });

  test('roadmap highlights in room when resume status is roomed', async () => {
    mockFetchParentResume.mockResolvedValue({
      registrationid: 10,
      resumeToken: 'tok-123',
      resumeCode: '4829JD',
      entries: [
        {
          entryid: 1,
          fname: 'Amy',
          lname: 'Doe',
          symptoms: 'Fever',
          position: 4,
          status: 'roomed',
          estimatedWait: '—',
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/status']}>
        <Routes>
          <Route path="/status" element={<StatusPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('In Room')).toBeInTheDocument();
    });

    const currentStep = document.querySelector('.roadmap__dot--current');
    expect(currentStep?.parentElement).toHaveTextContent('In Room');
    expect(screen.getByText('In room')).toBeInTheDocument();
  });
});
