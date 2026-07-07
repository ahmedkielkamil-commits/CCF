import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DatabaseStatusPage } from './DatabaseStatusPage';

const mockFetchHealth = vi.fn();
const mockFetchSyncReport = vi.fn();
const mockFetchWaitInterval = vi.fn();

vi.mock('../api/queue', () => ({
  fetchHealth: () => mockFetchHealth(),
  fetchSyncReport: () => mockFetchSyncReport(),
  fetchWaitInterval: () => mockFetchWaitInterval(),
}));

describe('DatabaseStatusPage', () => {
  beforeEach(() => {
    mockFetchHealth.mockReset();
    mockFetchSyncReport.mockReset();
    mockFetchWaitInterval.mockReset();
    mockFetchWaitInterval.mockResolvedValue({ minutes: 15 });
  });

  test('renders live store tables with countdown columns', async () => {
    mockFetchHealth.mockResolvedValueOnce({ ok: true });
    mockFetchSyncReport.mockResolvedValueOnce({
      checkedAt: '2026-01-01T00:00:00.000Z',
      live: { inSync: true, mismatchCount: 0, mismatches: [] },
      mysql: {
        liveCount: 1,
        live: [
          {
            entryid: 7,
            position: 2,
            fname: 'Amy',
            lname: 'Doe',
            status: 'waiting',
            checked_in_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      redis: {
        liveCount: 1,
        live: [
          {
            entryid: 7,
            position: 2,
            fname: 'Amy',
            lname: 'Doe',
            status: 'waiting',
            checked_in_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <DatabaseStatusPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('MySQL Live Entries')).toBeInTheDocument();
    });
    expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
    expect(screen.getByText('Backend Server')).toBeInTheDocument();
    expect(screen.getByText('Redis Live Entries')).toBeInTheDocument();
    expect(screen.getAllByText('Est. Wait').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Countdown').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Amy Doe')).toHaveLength(2);
  });
});
