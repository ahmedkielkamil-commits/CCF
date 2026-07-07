import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from './ReportsPage';

const mockFetchSyncReport = vi.fn();

vi.mock('../api/queue', () => ({
  fetchSyncReport: () => mockFetchSyncReport(),
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    mockFetchSyncReport.mockReset();
  });

  test('renders comparison table and desync events', async () => {
    mockFetchSyncReport.mockResolvedValueOnce({
      checkedAt: '2026-01-01T00:00:00.000Z',
      live: {
        inSync: false,
        mismatchCount: 1,
        mismatches: [{ entryid: 7, issue: 'position mismatch (MySQL 2 vs Redis 3)' }],
      },
      mysql: { liveCount: 1, live: [{ entryid: 7, position: 2, fname: 'Amy', lname: 'Doe', status: 'waiting' }] },
      redis: { liveCount: 1, live: [{ entryid: 7, position: 3, fname: 'Amy', lname: 'Doe', status: 'waiting' }] },
    });

    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Queue Data Comparison')).toBeInTheDocument();
    });
    expect(screen.getByText('Desync Events')).toBeInTheDocument();
    expect(screen.getByText('Entry #7')).toBeInTheDocument();
    expect(screen.getByText('position mismatch (MySQL 2 vs Redis 3)')).toBeInTheDocument();
  });
});
