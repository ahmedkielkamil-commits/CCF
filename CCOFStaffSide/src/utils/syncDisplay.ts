import type { SyncRow } from '../api/queue';

export function formatWaitRange(calculatedMinutes: number) {
  if (calculatedMinutes <= 0) return "You're next";
  let low = Math.round(calculatedMinutes / 5) * 5;
  if (low < calculatedMinutes - 3) low += 5;
  if (calculatedMinutes > 45) {
    low = Math.max(15, Math.floor((calculatedMinutes - 7) / 5) * 5);
  }
  low = Math.max(15, low);
  let high = Math.min(60, low + 15);
  if (high < low) {
    low = Math.max(15, high - 15);
  }
  return `${low}–${high} min`;
}

export const COUNTDOWN_WARNING_SECONDS = 10 * 60;

export function getRemainingSeconds(
  row: { position: number; status: string; checked_in_at?: string },
  intervalMinutes: number,
  nowMs: number
) {
  if (row.status !== 'waiting' && row.status !== 'arrived') return null;
  const ahead = Math.max(0, Number(row.position) - 1);
  const waitAheadSeconds = ahead * intervalMinutes * 60;
  const checkedInMs = new Date(row.checked_in_at || '').getTime();
  if (Number.isNaN(checkedInMs)) return null;
  const elapsedSeconds = (nowMs - checkedInMs) / 1000;
  return Math.round(waitAheadSeconds - elapsedSeconds);
}

export function getCountdownTone(remainingSeconds: number | null) {
  if (remainingSeconds == null) return null;
  if (remainingSeconds < 0) return 'overdue';
  if (remainingSeconds <= COUNTDOWN_WARNING_SECONDS) return 'warning';
  return 'ok';
}

export function countdownCellClass(remainingSeconds: number | null) {
  const tone = getCountdownTone(remainingSeconds);
  return tone ? `countdown-cell countdown-cell--${tone}` : 'countdown-cell';
}

export function formatCountdown(seconds: number | null) {
  if (seconds == null) return '—';
  const negative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const hours = Math.floor(absSeconds / 3600);
  const mins = Math.floor((absSeconds % 3600) / 60);
  const secs = absSeconds % 60;
  const formatted =
    hours > 0
      ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

export function patientName(row: SyncRow) {
  return `${row.fname ?? ''} ${row.lname ?? ''}`.trim() || '—';
}
