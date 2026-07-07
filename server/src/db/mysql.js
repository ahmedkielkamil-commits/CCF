const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  host: env.mysql.host,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
});

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, closePool };
