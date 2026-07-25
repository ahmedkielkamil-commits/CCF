const { query } = require('../../db/mysql');
const { canUseMysql } = require('./store-health');

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

function clampDays(days) {
  const parsed = Number(days);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.floor(parsed));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function hourLabel(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  if (normalized === 0) return '12 AM';
  if (normalized === 12) return '12 PM';
  if (normalized < 12) return `${normalized} AM`;
  return `${normalized - 12} PM`;
}

async function getUsageReport({ days = DEFAULT_DAYS } = {}) {
  if (!(await canUseMysql())) {
    const err = new Error('MySQL unavailable — usage analytics require the primary database.');
    err.status = 503;
    throw err;
  }

  const windowDays = clampDays(days);

  const [
    peakHourRows,
    dailyRows,
    joinRoomRows,
    funnelRows,
    noShowRows,
    todayRows,
    totalsRows,
  ] = await Promise.all([
    query(
      `SELECT HOUR(r.checked_in_at) AS hour, COUNT(*) AS families
       FROM registration r
       WHERE r.checked_in_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY HOUR(r.checked_in_at)
       ORDER BY hour ASC`,
      [windowDays]
    ),
    query(
      `SELECT DATE(r.checked_in_at) AS day,
              COUNT(DISTINCT r.registrationid) AS families,
              COUNT(q.entryid) AS children
       FROM registration r
       JOIN queue_entry q ON q.registrationid = r.registrationid
       WHERE r.checked_in_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(r.checked_in_at)
       ORDER BY day ASC`,
      [windowDays]
    ),
    query(
      `SELECT TIMESTAMPDIFF(
         MINUTE,
         r.checked_in_at,
         STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(q.roomed, '$.timestamp')), '%Y-%m-%dT%H:%i:%s')
       ) AS minutes
       FROM queue_entry q
       JOIN registration r ON r.registrationid = q.registrationid
       WHERE q.roomed IS NOT NULL
         AND r.checked_in_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [windowDays]
    ),
    query(
      `SELECT
         COUNT(*) AS joined,
         SUM(
           CASE
             WHEN q.arrived IS NOT NULL OR q.roomed IS NOT NULL OR q.completed IS NOT NULL THEN 1
             ELSE 0
           END
         ) AS reached_clinic,
         SUM(
           CASE
             WHEN q.roomed IS NOT NULL OR q.status = 'completed' THEN 1
             ELSE 0
           END
         ) AS roomed,
         SUM(CASE WHEN q.status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM queue_entry q
       JOIN registration r ON r.registrationid = q.registrationid
       WHERE r.checked_in_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [windowDays]
    ),
    query(
      `SELECT
         SUM(CASE WHEN q.status = 'no_show' THEN 1 ELSE 0 END) AS total_no_show,
         SUM(
           CASE
             WHEN q.status = 'no_show'
               AND JSON_UNQUOTE(JSON_EXTRACT(q.no_show, '$.staff_name')) = 'Parent Cancel'
             THEN 1
             ELSE 0
           END
         ) AS parent_cancel,
         SUM(
           CASE
             WHEN q.status = 'no_show'
               AND (
                 JSON_EXTRACT(q.no_show, '$.staff_name') IS NULL
                 OR JSON_UNQUOTE(JSON_EXTRACT(q.no_show, '$.staff_name')) != 'Parent Cancel'
               )
             THEN 1
             ELSE 0
           END
         ) AS staff_no_show,
         COUNT(*) AS total_entries
       FROM queue_entry q
       JOIN registration r ON r.registrationid = q.registrationid
       WHERE r.checked_in_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [windowDays]
    ),
    query(
      `SELECT
         COUNT(DISTINCT r.registrationid) AS families,
         COUNT(q.entryid) AS children
       FROM registration r
       JOIN queue_entry q ON q.registrationid = q.registrationid
       WHERE DATE(r.checked_in_at) = CURDATE()`
    ),
    query(
      `SELECT
         COUNT(DISTINCT r.registrationid) AS families,
         COUNT(q.entryid) AS children
       FROM registration r
       JOIN queue_entry q ON q.registrationid = q.registrationid
       WHERE r.checked_in_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [windowDays]
    ),
  ]);

  const joinRoomMinutes = joinRoomRows
    .map((row) => Number(row.minutes))
    .filter((value) => Number.isFinite(value) && value >= 0);

  const funnel = funnelRows[0] ?? {};
  const noShow = noShowRows[0] ?? {};
  const today = todayRows[0] ?? {};
  const totals = totalsRows[0] ?? {};

  const totalNoShow = Number(noShow.total_no_show) || 0;
  const totalEntries = Number(noShow.total_entries) || 0;
  const noShowRate = totalEntries > 0 ? Math.round((totalNoShow / totalEntries) * 1000) / 10 : 0;

  const peakByHour = new Map(
    peakHourRows.map((row) => [Number(row.hour), Number(row.families) || 0])
  );
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hourLabel(hour),
    families: peakByHour.get(hour) ?? 0,
  })).filter((row) => row.hour >= 8 && row.hour <= 17);

  return {
    checkedAt: new Date().toISOString(),
    days: windowDays,
    summary: {
      totalFamilies: Number(totals.families) || 0,
      totalChildren: Number(totals.children) || 0,
      todayFamilies: Number(today.families) || 0,
      todayChildren: Number(today.children) || 0,
      medianJoinToRoomMinutes: median(joinRoomMinutes),
      joinToRoomSampleSize: joinRoomMinutes.length,
      noShowRate,
      noShowTotal: totalNoShow,
      noShowStaff: Number(noShow.staff_no_show) || 0,
      noShowParentCancel: Number(noShow.parent_cancel) || 0,
    },
    peakHours,
    dailyUsage: dailyRows.map((row) => ({
      date: row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day).slice(0, 10),
      families: Number(row.families) || 0,
      children: Number(row.children) || 0,
    })),
    funnel: {
      joined: Number(funnel.joined) || 0,
      reachedClinic: Number(funnel.reached_clinic) || 0,
      roomed: Number(funnel.roomed) || 0,
      completed: Number(funnel.completed) || 0,
    },
  };
}

module.exports = { getUsageReport, clampDays, hourLabel, median };
