import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from './ReportsPage';

const mockFetchUsageReport = vi.fn();

vi.mock('../api/queue', () => ({
  fetchUsageReport: (days: number) => mockFetchUsageReport(days),
}));

const usageFixture = {
  checkedAt: '2026-01-01T00:00:00.000Z',
  days: 14,
  summary: {
    totalFamilies: 40,
    totalChildren: 55,
    todayFamilies: 3,
    todayChildren: 4,
    medianJoinToRoomMinutes: 42,
    joinToRoomSampleSize: 30,
    noShowRate: 12.5,
    noShowTotal: 7,
    noShowStaff: 5,
    noShowParentCancel: 2,
  },
  peakHours: [
    { hour: 9, label: '9 AM', families: 4 },
    { hour: 10, label: '10 AM', families: 8 },
    { hour: 15, label: '3 PM', families: 6 },
  ],
  dailyUsage: [
    { date: '2026-01-01', families: 3, children: 4 },
    { date: '2026-01-02', families: 5, children: 7 },
  ],
  funnel: {
    joined: 55,
    reachedClinic: 48,
    roomed: 40,
    completed: 35,
  },
};

describe('ReportsPage', () => {
  beforeEach(() => {
    mockFetchUsageReport.mockReset();
  });

  test('renders usage insights only', async () => {
    mockFetchUsageReport.mockResolvedValue(usageFixture);

    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Peak Check-In Hours')).toBeInTheDocument();
    });

    expect(screen.getByText('Queue Funnel')).toBeInTheDocument();
    expect(screen.getByText('Daily Queue Usage')).toBeInTheDocument();
    expect(screen.getByText('Median Join → Room')).toBeInTheDocument();
    expect(screen.getByText('42m')).toBeInTheDocument();
    expect(screen.queryByText('Queue Data Comparison')).not.toBeInTheDocument();
    expect(screen.queryByText('Desync Events')).not.toBeInTheDocument();
  });
});
