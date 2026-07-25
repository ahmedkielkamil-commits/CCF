import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchUsageReport, type UsageReport } from '../api/queue';
import { StaffPageHeader } from '../components/staff-ui';
import { UsageInsights } from '../components/UsageInsights';

export function ReportsPage() {
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageDays, setUsageDays] = useState(14);

  const loadUsage = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const usageReport = await fetchUsageReport(days);
      setUsage(usageReport);
      setUsageError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setUsageError('Not on clinic network (staff IP allowlist).');
      } else {
        setUsageError(error instanceof Error ? error.message : 'Unable to load usage insights.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage(usageDays).catch(() => undefined);
  }, [loadUsage, usageDays]);

  return (
    <>
      <StaffPageHeader
        title="Reports"
        subtitle="Queue usage insights, peak hours, funnel, and wait-time trends."
        actions={
          <>
            <span className="db-meta">
              Last updated: {usage ? new Date(usage.checkedAt).toLocaleTimeString() : '—'}
            </span>
            <button
              type="button"
              className="btn btn--outline btn--compact"
              onClick={() => loadUsage(usageDays).catch(() => undefined)}
            >
              Refresh Now
            </button>
          </>
        }
      />

      {loading && <p className="muted">Loading reports…</p>}
      {usageError && <p className="error-text">{usageError}</p>}
      {usage && !usageError && (
        <UsageInsights report={usage} days={usageDays} onDaysChange={setUsageDays} />
      )}
    </>
  );
}
