/**
 * MySQL DATETIME values are stored/read as UTC (pool timezone: 'Z').
 * Redis and API payloads use the same UTC ISO strings so countdowns stay in sync.
 */
function formatDbDatetimeForApi(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (raw.includes('T')) {
    const hasExplicitZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    const normalized = hasExplicitZone ? raw : `${raw.split('.')[0]}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
  }

  const normalized = raw.replace(' ', 'T');
  const parsed = new Date(`${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function normalizeTimestamp(value) {
  return formatDbDatetimeForApi(value);
}

function normalizeRedisEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    ...entry,
    checked_in_at: normalizeTimestamp(entry.checked_in_at) || new Date().toISOString(),
  };
}

module.exports = {
  formatDbDatetimeForApi,
  normalizeTimestamp,
  normalizeRedisEntry,
};
