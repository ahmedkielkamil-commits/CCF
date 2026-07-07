const PHI_KEYS = new Set([
  'parent_fname', 'parent_lname', 'phone', 'additional_notes',
  'fname', 'lname', 'symptoms',
]);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = PHI_KEYS.has(k) ? '[redacted]' : sanitize(v);
  }
  return out;
}

const safeLog = {
  info:  (msg, meta) => { if (meta !== undefined) console.log(msg, sanitize(meta)); else console.log(msg); },
  warn:  (msg, meta) => { if (meta !== undefined) console.warn(msg, sanitize(meta)); else console.warn(msg); },
  error: (msg, meta) => { if (meta !== undefined) console.error(msg, sanitize(meta)); else console.error(msg); },
};

module.exports = { safeLog, sanitize };
