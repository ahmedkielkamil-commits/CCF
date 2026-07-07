const mysql = require('./sync-mysql');
const redis = require('./sync-redis');

function compare(mysqlRows, redisRows) {
  const mysqlMap = new Map(mysqlRows.map((r) => [Number(r.entryid), r]));
  const redisMap = new Map(redisRows.map((r) => [Number(r.entryid), r]));
  const mismatches = [];

  for (const [id, m] of mysqlMap) {
    const r = redisMap.get(id);
    if (!r) {
      mismatches.push({ entryid: id, issue: 'in MySQL only (missing from Redis)' });
      continue;
    }
    if (Number(m.position) !== Number(r.position)) {
      mismatches.push({
        entryid: id,
        issue: `position mismatch (MySQL ${m.position} vs Redis ${r.position})`,
      });
    }
    if (m.status !== r.status) {
      mismatches.push({
        entryid: id,
        issue: `status mismatch (MySQL ${m.status} vs Redis ${r.status})`,
      });
    }
    if (m.fname !== r.fname || m.lname !== r.lname) {
      mismatches.push({ entryid: id, issue: 'name mismatch' });
    }
  }

  for (const [id] of redisMap) {
    if (!mysqlMap.has(id)) {
      mismatches.push({ entryid: id, issue: 'in Redis only (missing from MySQL live rows)' });
    }
  }

  return {
    inSync: mismatches.length === 0 && mysqlRows.length === redisRows.length,
    mismatchCount: mismatches.length,
    mismatches,
  };
}

async function getSyncReport() {
  const [mysqlResult, redisResult] = await Promise.allSettled([
    mysql.liveEntries(),
    redis.liveEntries(),
  ]);

  const mysqlLive = mysqlResult.status === 'fulfilled' ? mysqlResult.value : [];
  const redisLive = redisResult.status === 'fulfilled' ? redisResult.value : [];

  const infraIssues = [];
  if (mysqlResult.status === 'rejected') {
    infraIssues.push({
      entryid: null,
      issue: `MySQL unavailable: ${mysqlResult.reason?.message || 'unknown error'}`,
    });
  }
  if (redisResult.status === 'rejected') {
    infraIssues.push({
      entryid: null,
      issue: `Redis unavailable: ${redisResult.reason?.message || 'unknown error'}`,
    });
  }

  const live =
    infraIssues.length === 0
      ? compare(mysqlLive, redisLive)
      : {
        inSync: false,
        mismatchCount: infraIssues.length,
        mismatches: infraIssues,
      };

  return {
    checkedAt: new Date().toISOString(),
    live,
    mysql: { live: mysqlLive, liveCount: mysqlLive.length },
    redis: { live: redisLive, liveCount: redisLive.length },
  };
}

module.exports = { getSyncReport };
