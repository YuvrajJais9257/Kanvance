/**
 * timesheetRun.model.js
 * Audit trail for timesheet upload runs + parsed rows.
 */
const pool = require("../config/db");

// ── Create a new upload run ───────────────────────────────────────────────
exports.createRun = async ({ uploaded_by, filename, row_count, status = "pending" }) => {
  const [result] = await pool.execute(
    `INSERT INTO timesheet_upload_runs (uploaded_by, filename, row_count, status)
     VALUES (?, ?, ?, ?)`,
    [uploaded_by ?? null, filename, row_count, status]
  );
  return result.insertId;
};

// ── Update run status ─────────────────────────────────────────────────────
exports.updateRunStatus = async (id, status) => {
  await pool.execute(
    "UPDATE timesheet_upload_runs SET status = ? WHERE id = ?",
    [status, id]
  );
};

// ── List recent runs ──────────────────────────────────────────────────────
exports.listRuns = async (limit = 20) => {
  const [rows] = await pool.query(
    `SELECT r.*, u.name AS uploaded_by_name
     FROM timesheet_upload_runs r
     LEFT JOIN users u ON u.id = r.uploaded_by
     ORDER BY r.uploaded_at DESC
     LIMIT ${Number(limit)}`
  );
  return rows;
};

// ── Insert enriched rows for a run ───────────────────────────────────────
exports.insertRows = async (runId, rows) => {
  if (!rows.length) return;
  const values = rows.map((r) => [
    runId,
    r.row_num,
    r.logged_date   ?? null,
    r.employee      ?? null,
    r.project_id    ?? null,
    r.project_name  ?? null,
    r.task_name     ?? null,
    r.subtask_name  ?? null,
    r.hours_uploaded ?? null,
    r.hours_db      ?? null,
    r.hours_final   ?? null,
    r.status_uploaded ?? null,
    r.status_db     ?? null,
    r.status_final  ?? null,
    r.notes         ?? null,
    r.matched ? 1 : 0,
  ]);
  const placeholders = values.map(() =>
    "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).join(",");
  const flat = values.flat();
  await pool.query(
    `INSERT INTO timesheet_rows
       (run_id, row_num, logged_date, employee, project_id, project_name,
        task_name, subtask_name, hours_uploaded, hours_db, hours_final,
        status_uploaded, status_db, status_final, notes, matched)
     VALUES ${placeholders}`,
    flat
  );
};

// ── Get rows for a run ────────────────────────────────────────────────────
exports.getRows = async (runId) => {
  const [rows] = await pool.execute(
    "SELECT * FROM timesheet_rows WHERE run_id = ? ORDER BY row_num",
    [runId]
  );
  return rows;
};
