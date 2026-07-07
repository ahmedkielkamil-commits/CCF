import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchHealth, fetchSyncReport, fetchWaitInterval, type SyncRow } from '../api/queue';
import { StaffPageHeader } from '../components/staff-ui';
import { SystemHealthBar } from '../components/SystemHealthBar';
import { formatCountdown, formatWaitRange, getRemainingSeconds, patientName } from '../utils/syncDisplay';

function LiveStoreTable({
  title,
  rows,
  intervalMinutes,
  nowMs,
}: {
  title: string;
  rows: SyncRow[];
  intervalMinutes: number;
  nowMs: number;
}) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{title}</h2>
        <span className="count-badge">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted">(empty)</p>
      ) : (
        <div className="table-wrap table-wrap--light">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Position</th>
                <th>Entry ID</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Est. Wait</th>
                <th>Countdown</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const remainingSeconds = getRemainingSeconds(row, intervalMinutes, nowMs);
                const waitText = remainingSeconds == null ? '—' : formatWaitRange(remainingSeconds / 60);
                return (
                  <tr key={row.entryid}>
                    <td>{row.position}</td>
                    <td>{row.entryid}</td>
                    <td>{patientName(row)}</td>
                    <td>{row.status}</td>
                    <td>{waitText}</td>
                    <td className="countdown-cell">{formatCountdown(remainingSeconds)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DatabaseStatusPage() {
  const [mysqlRows, setMysqlRows] = useState<SyncRow[]>([]);
  const [redisRows, setRedisRows] = useState<SyncRow[]>([]);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [inSync, setInSync] = useState<boolean | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [nowMs, setNowMs] = useState(Date.now());
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const [mysqlOk, setMysqlOk] = useState(true);
  const [redisOk, setRedisOk] = useState(true);

  const load = useCallback(async () => {
    try {
      const healthStart = performance.now();
      const [health, sync] = await Promise.all([fetchHealth(), fetchSyncReport()]);
      setResponseMs(Math.round(performance.now() - healthStart));
      setBackendOk(health.ok);
      setMysqlRows(sync.mysql.live);
      setRedisRows(sync.redis.live);
      setInSync(sync.live.inSync);
      setCheckedAt(sync.checkedAt);
      setMysqlOk(!sync.live.mismatches.some((m) => m.issue.startsWith('MySQL unavailable')));
      setRedisOk(!sync.live.mismatches.some((m) => m.issue.startsWith('Redis unavailable')));
      setSyncError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setSyncError('Not on clinic network (staff IP allowlist).');
      } else {
        setSyncError(error instanceof Error ? error.message : 'Unable to load database status.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWaitInterval()
      .then((interval) => setIntervalMinutes(interval.minutes))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
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

  const allOperational = backendOk && inSync && !syncError && mysqlOk && redisOk;
  const activeEntries = useMemo(
    () => Math.max(mysqlRows.length, redisRows.length),
    [mysqlRows.length, redisRows.length]
  );

  return (
    <>
      <StaffPageHeader
        title="Database Status"
        subtitle="Live MySQL and Redis queue snapshots with per-entry wait countdowns."
        actions={
          <>
            <span className="db-meta">
              Last checked: {checkedAt ? new Date(checkedAt).toLocaleTimeString() : '—'}
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

      {loading && <p className="muted">Loading database status…</p>}
      {syncError && <p className="error-text">{syncError}</p>}

      <SystemHealthBar
        allOperational={Boolean(allOperational)}
        backendOk={backendOk}
        responseMs={responseMs}
        inSync={inSync}
        mysqlOk={mysqlOk}
        redisOk={redisOk}
        mysqlCount={mysqlRows.length}
        redisCount={redisRows.length}
        activeEntries={activeEntries}
        checkedAt={checkedAt}
      />

      <div className="db-store-grid">
        <LiveStoreTable title="MySQL Live Entries" rows={mysqlRows} intervalMinutes={intervalMinutes} nowMs={nowMs} />
        <LiveStoreTable title="Redis Live Entries" rows={redisRows} intervalMinutes={intervalMinutes} nowMs={nowMs} />
      </div>
    </>
  );
}
