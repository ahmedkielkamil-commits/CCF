const { pool } = require('../../db/mysql');
const { formatDbDatetimeForApi } = require('../../utils/datetime');

async function reserve(n) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT COALESCE(MAX(position), 0) AS max_position
       FROM queue_entry
       WHERE status IN ('waiting', 'arrived')`
    );
    const max = Number(rows[0]?.max_position || 0);
    return Array.from({ length: n }, (_, i) => max + i + 1);
  } finally {
    conn.release();
  }
}

async function insert(body, positions, options = {}) {
  const conn = await pool.getConnection();
  const entries = [];
  const checkedInAt =
    options.checkedInAt instanceof Date
      ? options.checkedInAt
      : options.checkedInAt
        ? new Date(options.checkedInAt)
        : null;

  try {
    await conn.beginTransaction();
    const [reg] = checkedInAt && !Number.isNaN(checkedInAt.getTime())
      ? await conn.query(
        `INSERT INTO registration (parent_fname, parent_lname, phone, additional_notes, sms_opt_in, checked_in_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          body.parent_fname.trim(),
          body.parent_lname.trim(),
          body.phone.trim(),
          body.additional_notes?.trim() || null,
          Boolean(body.sms_opt_in),
          checkedInAt,
        ]
      )
      : await conn.query(
        `INSERT INTO registration (parent_fname, parent_lname, phone, additional_notes, sms_opt_in)
         VALUES (?, ?, ?, ?, ?)`,
        [
          body.parent_fname.trim(),
          body.parent_lname.trim(),
          body.phone.trim(),
          body.additional_notes?.trim() || null,
          Boolean(body.sms_opt_in),
        ]
      );
    const registrationid = reg.insertId;
    const [regRows] = await conn.query(
      `SELECT checked_in_at FROM registration WHERE registrationid = ?`,
      [registrationid]
    );
    const insertedCheckedInAt = formatDbDatetimeForApi(regRows[0]?.checked_in_at) || new Date().toISOString();
    for (let i = 0; i < body.children.length; i++) {
      const c = body.children[i];
      const [row] = await conn.query(
        `INSERT INTO queue_entry (registrationid, fname, lname, symptoms, position, status)
         VALUES (?, ?, ?, ?, ?, 'waiting')`,
        [registrationid, c.fname.trim(), c.lname.trim(), c.symptoms.trim(), positions[i]]
      );
      entries.push({
        entryid: row.insertId,
        registrationid,
        fname: c.fname.trim(),
        lname: c.lname.trim(),
        symptoms: c.symptoms.trim(),
        checked_in_at: insertedCheckedInAt,
        position: positions[i],
        status: 'waiting',
      });
    }
    await conn.commit();
    return { registrationid, entries };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function appendChildren(registrationid, children, positions) {
  const conn = await pool.getConnection();
  const entries = [];
  try {
    await conn.beginTransaction();
    const [regRows] = await conn.query(
      `SELECT parent_fname, parent_lname, checked_in_at FROM registration WHERE registrationid = ?`,
      [registrationid]
    );
    if (!regRows.length) {
      const e = new Error('Registration not found');
      e.status = 404;
      throw e;
    }
    const parentFname = regRows[0].parent_fname;
    const parentLname = regRows[0].parent_lname;
    const checkedInAt = formatDbDatetimeForApi(regRows[0].checked_in_at) || new Date().toISOString();

    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const [row] = await conn.query(
        `INSERT INTO queue_entry (registrationid, fname, lname, symptoms, position, status)
         VALUES (?, ?, ?, ?, ?, 'waiting')`,
        [registrationid, c.fname.trim(), c.lname.trim(), c.symptoms.trim(), positions[i]]
      );
      entries.push({
        entryid: row.insertId,
        registrationid,
        parent_fname: parentFname,
        parent_lname: parentLname,
        fname: c.fname.trim(),
        lname: c.lname.trim(),
        symptoms: c.symptoms.trim(),
        checked_in_at: checkedInAt,
        position: positions[i],
        status: 'waiting',
      });
    }
    await conn.commit();
    return { registrationid, entries };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { reserve, insert, appendChildren };
