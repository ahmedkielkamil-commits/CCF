function buildAuditRecord({ previousStatus, newStatus, staffName, req }) {
  return {
    timestamp: new Date().toISOString().slice(0, 19),
    previous_status: previousStatus,
    new_status: newStatus,
    staff_name: staffName,
    host: req.ip,
  };
}

module.exports = { buildAuditRecord };
