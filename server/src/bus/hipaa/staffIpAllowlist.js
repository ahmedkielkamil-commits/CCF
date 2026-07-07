const env = require('../../config/env');
const { safeLog } = require('./safeLog');

let warned = false;

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function inCidr(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bits] = cidr.split('/');
  const mask = (bits === '0') ? 0 : (~((1 << (32 - parseInt(bits, 10))) - 1)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
}

function normalizeIp(ip) {
  return (ip || '').replace(/^::ffff:/, '');
}

function staffIpAllowlist(req, res, next) {
  const allowed = env.staffAllowedIps;

  if (!allowed.length) {
    if (!warned) {
      safeLog.warn('STAFF_ALLOWED_IPS not configured — staff routes open to all IPs (dev mode only)');
      warned = true;
    }
    return next();
  }

  const reqIp = normalizeIp(req.ip);
  const ok = allowed.some((cidr) => inCidr(reqIp, cidr));
  if (!ok) return res.status(403).json({ error: 'Forbidden' });
  return next();
}

module.exports = staffIpAllowlist;
