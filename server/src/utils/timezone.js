const { AsyncLocalStorage } = require('async_hooks');
const env = require('../config/env');

const timezoneStore = new AsyncLocalStorage();
let lastKnownClientTimezone = null;

const IANA_PATTERN = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+$/;

function isValidTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  if (!IANA_PATTERN.test(timeZone.trim())) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

function resolveTimezone(candidate) {
  if (isValidTimezone(candidate)) return candidate.trim();
  if (isValidTimezone(env.clinicTimezone)) return env.clinicTimezone;
  return 'America/New_York';
}

function runWithTimezone(timezone, fn) {
  const resolved = resolveTimezone(timezone);
  return timezoneStore.run({ timezone: resolved }, fn);
}

function getActiveTimezone() {
  const fromStore = timezoneStore.getStore()?.timezone;
  if (fromStore) return fromStore;
  if (lastKnownClientTimezone) return lastKnownClientTimezone;
  return resolveTimezone(env.clinicTimezone);
}

function rememberClientTimezone(timezone) {
  const resolved = resolveTimezone(timezone);
  lastKnownClientTimezone = resolved;
  return resolved;
}

function getTimezoneOffsetMs(timeZone, date) {
  const utcMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  );
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const pick = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const localAsUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour'),
    pick('minute'),
    pick('second')
  );
  return localAsUtc - utcMs;
}

function getLocalDayUtcBounds(timeZone, ref = new Date()) {
  const resolved = resolveTimezone(timeZone);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: resolved }).format(ref);
  const [year, month, day] = ymd.split('-').map(Number);
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const offsetMs = getTimezoneOffsetMs(resolved, new Date(noonUtc));
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

module.exports = {
  runWithTimezone,
  getActiveTimezone,
  resolveTimezone,
  rememberClientTimezone,
  getLocalDayUtcBounds,
  isValidTimezone,
};
