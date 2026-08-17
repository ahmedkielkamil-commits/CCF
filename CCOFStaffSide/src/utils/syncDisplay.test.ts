import { describe, expect, test } from 'vitest';
import {
  COUNTDOWN_WARNING_SECONDS,
  countdownCellClass,
  formatCountdown,
  getCountdownTone,
  getRemainingSeconds,
} from './syncDisplay';

describe('syncDisplay countdown', () => {
  test('uses position offsets from check-in time', () => {
    const checkedInAt = '2026-01-01T12:00:00.000Z';
    const nowMs = Date.parse(checkedInAt);

    expect(getRemainingSeconds({ position: 1, status: 'waiting', checked_in_at: checkedInAt }, 10, nowMs)).toBe(0);
    expect(getRemainingSeconds({ position: 2, status: 'waiting', checked_in_at: checkedInAt }, 10, nowMs)).toBe(600);
    expect(getRemainingSeconds({ position: 3, status: 'waiting', checked_in_at: checkedInAt }, 10, nowMs)).toBe(1200);
  });

  test('counts down and allows overdue values', () => {
    const checkedInAt = '2026-01-01T12:00:00.000Z';

    expect(
      getRemainingSeconds({ position: 1, status: 'waiting', checked_in_at: checkedInAt }, 15, Date.parse('2026-01-01T12:30:00.000Z'))
    ).toBe(-30 * 60);

    expect(
      getRemainingSeconds({ position: 2, status: 'waiting', checked_in_at: checkedInAt }, 10, Date.parse('2026-01-01T12:05:00.000Z'))
    ).toBe(5 * 60);
  });

  test('ticks down as now advances', () => {
    const checkedInAt = '2026-01-01T12:00:00.000Z';
    const dueMs = Date.parse(checkedInAt);
    expect(getRemainingSeconds({ position: 1, status: 'waiting', checked_in_at: checkedInAt }, 10, dueMs - 5000)).toBe(5);
    expect(getRemainingSeconds({ position: 1, status: 'waiting', checked_in_at: checkedInAt }, 10, dueMs + 5000)).toBe(-5);
  });

  test('returns null when check-in time is missing', () => {
    expect(getRemainingSeconds({ position: 4, status: 'waiting', checked_in_at: '' }, 10, Date.now())).toBeNull();
  });

  test('maps tones by remaining time', () => {
    expect(getCountdownTone(COUNTDOWN_WARNING_SECONDS + 1)).toBe('ok');
    expect(getCountdownTone(COUNTDOWN_WARNING_SECONDS)).toBe('warning');
    expect(getCountdownTone(524)).toBe('warning');
    expect(getCountdownTone(60)).toBe('warning');
    expect(getCountdownTone(1)).toBe('warning');
    expect(getCountdownTone(0)).toBe('warning');
    expect(getCountdownTone(-90)).toBe('overdue');
  });

  test('formats overdue countdown with a leading minus', () => {
    expect(formatCountdown(-125)).toBe('-02:05');
    expect(formatCountdown(125)).toBe('02:05');
    expect(formatCountdown(9010)).toBe('2:30:10');
  });

  test('applies tone classes on countdown cells', () => {
    expect(countdownCellClass(900)).toBe('countdown-cell countdown-cell--ok');
    expect(countdownCellClass(524)).toBe('countdown-cell countdown-cell--warning');
    expect(countdownCellClass(600)).toBe('countdown-cell countdown-cell--warning');
    expect(countdownCellClass(0)).toBe('countdown-cell countdown-cell--warning');
    expect(countdownCellClass(-30)).toBe('countdown-cell countdown-cell--overdue');
  });
});
