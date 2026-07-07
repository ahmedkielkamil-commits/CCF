import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchSyncReport, type SyncReport } from '../api/queue';
import { StaffPageHeader } from '../components/staff-ui';

function countByStatus(rows: SyncReport['mysql']['live']) {
  const counts = { waiting: 0, arrived: 0, roomed: 0, completed: 0 };
  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status as keyof typeof counts] += 1;
    }
  }
  return counts;
}

export function ReportsPage() {
  const [report, setReport] = useState<SyncReport | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const sync = await fetchSyncReport();
      setReport(sync);
      setSyncError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setSyncError('Not on clinic network (staff IP allowlist).');
      } else {
        setSyncError(error instanceof Error ? error.message : 'Unable to load sync report.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const mysqlCounts = useMemo(() => countByStatus(report?.mysql.live ?? []), [report]);
  const redisCounts = useMemo(() => countByStatus(report?.redis.live ?? []), [report]);

  const comparisonRows = [
    { label: 'Total Entries', mysql: report?.mysql.liveCount ?? 0, redis: report?.redis.liveCount ?? 0 },
    { label: 'Waiting', mysql: mysqlCounts.waiting, redis: redisCounts.waiting },
    { label: 'Arrived', mysql: mysqlCounts.arrived, redis: redisCounts.arrived },
    { label: 'In Room', mysql: mysqlCounts.roomed, redis: redisCounts.roomed },
  ];

  const desyncEvents = useMemo(() => {
    if (!report) return [];
    const events: Array<{ id: string; entryId: number | null; issue: string; checkedAt: string }> =
      report.live.mismatches.map((mismatch) => ({
        id: `${mismatch.entryid ?? 'infra'}-${mismatch.issue}`,
        entryId: mismatch.entryid ?? null,
        issue: mismatch.issue,
        checkedAt: report.checkedAt,
      }));
    if (!report.live.inSync && events.length === 0) {
      events.push({
        id: 'general-desync',
        entryId: null,
        issue: 'MySQL and Redis live queue data do not match.',
        checkedAt: report.checkedAt,
      });
    }
    return events;
  }, [report]);

  return (
    <>
      <StaffPageHeader
        title="Reports"
        subtitle="Desync events and MySQL vs Redis queue comparison."
        actions={
          <>
            <span className="db-meta">
              Last checked: {report ? new Date(report.checkedAt).toLocaleTimeString() : '—'}
            </span>
            <button type="button" className="btn btn--outline btn--compact" onClick={() => load().catch(() => undefined)}>
              Refresh Now
            </button>
            <label className="db-toggle">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              Auto-refresh every 5s
            </label>
          </>
        }
      />

      {loading && <p className="muted">Loading reports…</p>}
      {syncError && <p className="error-text">{syncError}</p>}

      <section className="panel">
        <div className="panel__head">
          <h2>Queue Data Comparison</h2>
          <span className={report?.live.inSync ? 'match-badge match-badge--ok' : 'match-badge match-badge--bad'}>
            {report?.live.inSync ? 'In Sync' : `${report?.live.mismatchCount ?? 0} issue(s)`}
          </span>
        </div>
        <div className="table-wrap table-wrap--light">
          <table className="data-table">
            <thead>
              <tr>
                <th>Queue Status</th>
                <th>MySQL (Primary)</th>
                <th>Redis (Cache)</th>
                <th>Difference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => {
                const diff = row.mysql - row.redis;
                const match = diff === 0;
                return (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.mysql}</td>
                    <td>{row.redis}</td>
                    <td>{diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}</td>
                    <td>
                      <span className={match ? 'match-badge match-badge--ok' : 'match-badge match-badge--bad'}>
                        {match ? 'Match' : 'Mismatch'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Desync Events</h2>
          <span className="count-badge">{desyncEvents.length}</span>
        </div>
        {desyncEvents.length === 0 ? (
          <p className="muted">No desync events detected.</p>
        ) : (
          <ul className="desync-list">
            {desyncEvents.map((event) => (
              <li key={event.id} className="desync-item">
                <div className="desync-item__head">
                  <strong>{event.entryId ? `Entry #${event.entryId}` : 'Infrastructure'}</strong>
                  <span>{new Date(event.checkedAt).toLocaleTimeString()}</span>
                </div>
                <p>{event.issue}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
