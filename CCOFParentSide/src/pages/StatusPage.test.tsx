import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StatusPage } from './StatusPage';

const mockFetchParentResume = vi.fn();
const mockCancelParentCheckIn = vi.fn();

const mockQueueState = {
  current: {
    entries: [] as Array<{
      entryid: number;
      registrationid: number;
      fname: string;
      lname: string;
      symptoms: string;
      position: number;
      status: 'waiting' | 'arrived' | 'roomed' | 'completed' | 'no_show';
      parent_fname: string;
      parent_lname: string;
      checked_in_at: string;
      estimatedWait: string;
    }>,
    inRoom: [] as Array<{
      entryid: number;
      registrationid: number;
      fname: string;
      lname: string;
      symptoms: string;
      position: number;
      status: 'roomed';
      parent_fname: string;
      parent_lname: string;
      checked_in_at: string;
      estimatedWait: string;
    }>,
    roomingInterval: { minutes: 15 },
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

vi.mock('../api/queue', () => ({
  fetchParentResume: (...args: unknown[]) => mockFetchParentResume(...args),
  cancelParentCheckIn: (...args: unknown[]) => mockCancelParentCheckIn(...args),
}));

vi.mock('../hooks/useQueue', () => ({
  useQueue: () => ({
    queue: mockQueueState.current,
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
    mockFetchParentResume.mockReset();
    mockQueueState.current = {
      entries: [],
      inRoom: [],
      roomingInterval: { minutes: 15 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
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

  test('roadmap highlights arrived on first join', async () => {
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

    const currentStep = document.querySelector('.roadmap__dot--current');
    expect(currentStep?.parentElement).toHaveTextContent('Arrived');
    expect(document.querySelectorAll('.roadmap__dot--done')).toHaveLength(1);
  });

  test('roadmap checks arrived and highlights in room after arrival', async () => {
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
          status: 'arrived',
          estimatedWait: '15 min - 30 min',
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
      expect(document.querySelectorAll('.roadmap__dot--done')).toHaveLength(2);
    });

    const currentStep = document.querySelector('.roadmap__dot--current');
    expect(currentStep?.parentElement).toHaveTextContent('In Room');
  });

  test('roadmap highlights complete when resume status is roomed', async () => {
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
    expect(currentStep?.parentElement).toHaveTextContent('Complete');
    expect(document.querySelectorAll('.roadmap__dot--done')).toHaveLength(3);
    expect(screen.getByText('In room')).toBeInTheDocument();
    expect(screen.getByText('Visit in progress')).toBeInTheDocument();
  });

  test('hides roadmap when visit is completed', async () => {
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
          status: 'completed',
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
      expect(screen.getByText('Visit complete')).toBeInTheDocument();
    });

    expect(document.querySelector('.roadmap')).not.toBeInTheDocument();
    expect(screen.getByText('Thank you for visiting today.')).toBeInTheDocument();
  });

  test('updates roadmap from live queue websocket without waiting for resume poll', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/status']}>
        <Routes>
          <Route path="/status" element={<StatusPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector('.roadmap__dot--current')?.parentElement).toHaveTextContent('Arrived');
    });

    const resumeCallsAfterLoad = mockFetchParentResume.mock.calls.length;

    mockQueueState.current = {
      entries: [
        {
          entryid: 1,
          registrationid: 10,
          fname: 'Amy',
          lname: 'Doe',
          symptoms: 'Fever',
          position: 1,
          status: 'arrived',
          parent_fname: 'Jane',
          parent_lname: 'Doe',
          checked_in_at: '2026-01-01T12:00:00.000Z',
          estimatedWait: '15 min - 30 min',
        },
      ],
      inRoom: [],
      roomingInterval: { minutes: 15 },
      updatedAt: '2026-01-01T00:00:01.000Z',
    };

    rerender(
      <MemoryRouter initialEntries={['/status']}>
        <Routes>
          <Route path="/status" element={<StatusPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelectorAll('.roadmap__dot--done')).toHaveLength(2);
    });
    expect(document.querySelector('.roadmap__dot--current')?.parentElement).toHaveTextContent('In Room');
    expect(mockFetchParentResume.mock.calls.length).toBeGreaterThanOrEqual(resumeCallsAfterLoad);
  });

  test('updates roadmap to in room from inRoom websocket payload', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/status']}>
        <Routes>
          <Route path="/status" element={<StatusPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector('.roadmap__dot--current')?.parentElement).toHaveTextContent('Arrived');
    });

    mockQueueState.current = {
      entries: [],
      inRoom: [
        {
          entryid: 1,
          registrationid: 10,
          fname: 'Amy',
          lname: 'Doe',
          symptoms: 'Fever',
          position: 4,
          status: 'roomed',
          parent_fname: 'Jane',
          parent_lname: 'Doe',
          checked_in_at: '2026-01-01T12:00:00.000Z',
          estimatedWait: '—',
        },
      ],
      roomingInterval: { minutes: 15 },
      updatedAt: '2026-01-01T00:00:02.000Z',
    };

    rerender(
      <MemoryRouter initialEntries={['/status']}>
        <Routes>
          <Route path="/status" element={<StatusPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('In room')).toBeInTheDocument();
    });
    expect(document.querySelector('.roadmap__dot--current')?.parentElement).toHaveTextContent('Complete');
    expect(document.querySelectorAll('.roadmap__dot--done')).toHaveLength(3);
  });
});
