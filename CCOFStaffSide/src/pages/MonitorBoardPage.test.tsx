import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../api/client';
import { MonitorBoardPage } from './MonitorBoardPage';

const mockFetchMonitorQueue = vi.fn();

vi.mock('../api/queue', () => ({
  fetchMonitorQueue: () => mockFetchMonitorQueue(),
}));

describe('MonitorBoardPage', () => {
  beforeEach(() => {
    mockFetchMonitorQueue.mockReset();
  });

  test('renders monitor rows from payload', async () => {
    mockFetchMonitorQueue.mockResolvedValueOnce({
      entries: [{ entryid: 1, ticket: '#1', initials: 'AD', position: 1, status: 'waiting', estimatedWait: '15 min - 30 min' }],
      roomingInterval: { minutes: 15 },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <MonitorBoardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('AD')).toBeInTheDocument();
    });
  });

  test('shows network-only message on 403', async () => {
    mockFetchMonitorQueue.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));

    render(
      <MemoryRouter>
        <MonitorBoardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Not on clinic network. Monitor board is staff-network only.')).toBeInTheDocument();
    });
  });
});
