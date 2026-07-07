import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchMonitorQueue } from '../api/queue';
import { StaffPageHeader, StatusBadge } from '../components/staff-ui';
import type { MonitorPayload } from '../types/queue';

export function MonitorBoardPage() {
  const [payload, setPayload] = useState<MonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchMonitorQueue();
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError('Not on clinic network. Monitor board is staff-network only.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load monitor board');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load().catch(() => undefined);
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const rows = payload?.entries ?? [];

  return (
    <>
      <StaffPageHeader
        title="Clinic Monitor Board"
        subtitle="PHI-safe view — no names or symptoms"
      />

      {loading && <p className="muted">Loading monitor board…</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="panel">
        <div className="panel__head">
          <h2>Live Queue Monitor</h2>
          <span className="count-badge">{rows.length}</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Order</th>
                <th>Status</th>
                <th>Est. Wait</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.entryid}>
                  <td>{entry.ticket}</td>
                  <td>
                    <span className="order-dot">{entry.position}</span>
                  </td>
                  <td>
                    <StatusBadge status={entry.status} />
                  </td>
                  <td>{entry.estimatedWait}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="muted panel__foot">
          Last updated: {payload ? new Date(payload.updatedAt).toLocaleTimeString() : '—'} · Auto-refresh every 10s
        </p>
      </section>
    </>
  );
}
