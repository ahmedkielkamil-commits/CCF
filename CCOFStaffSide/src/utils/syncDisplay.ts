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

export function getRemainingSeconds(
  row: { position: number; status: string; checked_in_at?: string },
  intervalMinutes: number,
  nowMs: number
) {
  if (row.status !== 'waiting' && row.status !== 'arrived') return null;
  const ahead = Math.max(0, Number(row.position) - 1);
  const baselineSeconds = ahead * intervalMinutes * 60;
  const checkedInMs = new Date(row.checked_in_at || '').getTime();
  if (Number.isNaN(checkedInMs)) return baselineSeconds;
  const elapsedSeconds = Math.max(0, (nowMs - checkedInMs) / 1000);
  return Math.max(0, Math.round(baselineSeconds - elapsedSeconds));
}

export function formatCountdown(seconds: number | null) {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function patientName(row: SyncRow) {
  return `${row.fname ?? ''} ${row.lname ?? ''}`.trim() || '—';
}
