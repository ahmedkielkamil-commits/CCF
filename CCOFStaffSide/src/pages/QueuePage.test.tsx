import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../api/client';
import { QueuePage } from './QueuePage';

const mockPatchQueueStatus = vi.fn();
const mockSetQueue = vi.fn();
const mockUseQueue = vi.fn();

vi.mock('../api/queue', () => ({
  patchQueueStatus: (...args: unknown[]) => mockPatchQueueStatus(...args),
}));

vi.mock('../hooks/useQueue', () => ({
  useQueue: () => mockUseQueue(),
}));

vi.mock('../hooks/useStaffName', () => ({
  useStaffName: () => ({ staffName: 'Sarah' }),
}));

describe('QueuePage', () => {
  beforeEach(() => {
    mockPatchQueueStatus.mockReset();
    mockSetQueue.mockReset();
    mockUseQueue.mockReturnValue({
      loading: false,
      error: null,
      setQueue: mockSetQueue,
      queue: {
        roomingInterval: { minutes: 15 },
        updatedAt: '2026-01-01T00:00:00.000Z',
        entries: [
          {
            entryid: 1,
            registrationid: 11,
            fname: 'Amy',
            lname: 'Doe',
            parent_fname: 'Jane',
            parent_lname: 'Doe',
            checked_in_at: '2026-01-01T12:00:00.000Z',
            symptoms: 'Fever',
            position: 1,
            status: 'waiting',
            estimatedWait: '15 min - 30 min',
          },
        ],
      },
    });
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders queue row and sends status update', async () => {
    const user = userEvent.setup();
    mockPatchQueueStatus.mockResolvedValueOnce({ entryid: 1, status: 'arrived', queue: { entries: [] } });

    render(
      <MemoryRouter>
        <QueuePage />
      </MemoryRouter>
    );

    expect(screen.getByText('Amy Doe')).toBeInTheDocument();
    expect(screen.getByText('Countdown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as Arrived' }));

    expect(mockPatchQueueStatus).toHaveBeenCalledWith(1, 'arrived', 'Sarah');
    expect(mockSetQueue).toHaveBeenCalled();
  });

  test('shows allowlist alert when status update is forbidden', async () => {
    const user = userEvent.setup();
    mockPatchQueueStatus.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));

    render(
      <MemoryRouter>
        <QueuePage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Mark as Arrived' }));
    expect(window.alert).toHaveBeenCalledWith('Not on clinic network. Ask admin to add your IP.');
  });
});
