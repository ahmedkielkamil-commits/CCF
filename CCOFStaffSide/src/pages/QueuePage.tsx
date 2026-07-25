import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { patchQueueStatus } from '../api/queue';
import { StaffPageHeader, StatusBadge } from '../components/staff-ui';
import { useQueue } from '../hooks/useQueue';
import { useStaffName } from '../hooks/useStaffName';
import type { QueueStatus } from '../types/queue';
import { formatCountdown, getRemainingSeconds } from '../utils/syncDisplay';

function nextAction(status: QueueStatus) {
  if (status === 'waiting') return { label: 'Mark as Arrived', next: 'arrived' as QueueStatus };
  if (status === 'arrived') return { label: 'Room Now', next: 'roomed' as QueueStatus };
  if (status === 'roomed') return { label: 'Complete', next: 'completed' as QueueStatus };
  return null;
}

function formatCheckInTime(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function QueuePage() {
  const { queue, setQueue, loading, error } = useQueue();
  const { staffName } = useStaffName();
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const intervalMinutes = queue?.roomingInterval?.minutes ?? 15;

  async function updateStatus(entryId: number, status: QueueStatus) {
    try {
      const updated = await patchQueueStatus(entryId, status, staffName);
      if (updated.queue) setQueue(updated.queue);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        alert('Not on clinic network. Ask admin to add your IP.');
        return;
      }
      alert(err instanceof Error ? err.message : 'Unable to update status');
    }
  }

  const rows = queue?.entries ?? [];
  const currentWait = rows[0]?.estimatedWait ?? `${queue?.roomingInterval.minutes ?? 15} min`;

  return (
    <>
      <StaffPageHeader
        title="Queue Management"
        subtitle={`Current wait: ${currentWait}`}
        actions={
          <Link to="/add" className="btn btn--maroon btn--compact">
            + Add Walk-In
          </Link>
        }
      />

      {loading && <p className="muted">Loading queue…</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="panel">
        <div className="panel__head">
          <h2>Current Walk-In Queue</h2>
          <span className="count-badge">{rows.length}</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Patient Name</th>
                <th>Parent Name</th>
                <th>Appointment Made</th>
                <th>Symptom</th>
                <th>Est. Wait</th>
                <th>Countdown</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const action = nextAction(entry.status);
                const remainingSeconds = getRemainingSeconds(entry, intervalMinutes, nowMs);
                const isOverdue =
                  remainingSeconds === 0 &&
                  (entry.status === 'waiting' || entry.status === 'arrived');
                return (
                  <tr key={entry.entryid} className={isOverdue ? 'queue-row--overdue' : undefined}>
                    <td>
                      <span className="order-dot">{entry.position}</span>
                    </td>
                    <td>
                      {entry.fname} {entry.lname}
                    </td>
                    <td>{`${entry.parent_fname ?? ''} ${entry.parent_lname ?? ''}`.trim() || '—'}</td>
                    <td>{formatCheckInTime(entry.checked_in_at)}</td>
                    <td>{entry.symptoms}</td>
                    <td>{entry.estimatedWait}</td>
                    <td
                      className={`countdown-cell${isOverdue ? ' countdown-cell--overdue' : ''}`}
                      title={isOverdue ? 'Estimated wait exceeded' : undefined}
                    >
                      {formatCountdown(remainingSeconds)}
                    </td>
                    <td>
                      <StatusBadge status={entry.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {action && (
                          <button
                            type="button"
                            className="action-btn action-btn--primary"
                            onClick={() => updateStatus(entry.entryid, action.next)}
                          >
                            {action.label}
                          </button>
                        )}
                        {entry.status !== 'completed' && (
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => updateStatus(entry.entryid, 'no_show')}
                          >
                            No Show
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="muted panel__foot">
          Last updated: {queue ? new Date(queue.updatedAt).toLocaleTimeString() : '—'}
        </p>
      </section>
    </>
  );
}
