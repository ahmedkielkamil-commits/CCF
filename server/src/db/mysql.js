const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  // Cloud SQL DATETIME values are UTC; avoid local-TZ reinterpretation (+4h on US East).
  timezone: 'Z',
});

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, closePool };
