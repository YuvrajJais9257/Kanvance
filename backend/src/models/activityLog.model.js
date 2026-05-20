/**
 * activityLog.model.js
 * Hours source of truth — used by timesheet enrichment and analytics.
 */
const pool = require("../config/db");

// ── Log hours for a user on a project/subtask ─────────────────────────────
exports.create = async ({ subtask_id, project_id, user_id, employee, logged_date, hours, notes }) => {
  const [result] = await pool.execute(
    `INSERT INTO activity_logs
       (subtask_id, project_id, user_id, employee, logged_date, hours, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [subtask_id ?? null, project_id, user_id ?? null, employee, logged_date, hours, notes ?? null]
  );
  return result.insertId;
};

// ── Sum hours per employee per project (for timesheet enrichment) ─────────
exports.sumByEmployeeProject = async (employee, projectId) => {
  const [[row]] = await pool.execute(
    `SELECT COALESCE(SUM(hours), 0) AS total_hours
     FROM activity_logs
     WHERE employee = ? AND project_id = ?`,
    [employee, projectId]
  );
  return Number(row.total_hours);
};

// ── Sum hours per employee per subtask ────────────────────────────────────
exports.sumByEmployeeSubtask = async (employee, subtaskId) => {
  const [[row]] = await pool.execute(
    `SELECT COALESCE(SUM(hours), 0) AS total_hours
     FROM activity_logs
     WHERE employee = ? AND subtask_id = ?`,
    [employee, subtaskId]
  );
  return Number(row.total_hours);
};

// ── Hours per user per project (for analytics) ────────────────────────────
exports.hoursPerUserPerProject = async () => {
  const [rows] = await pool.execute(
    `SELECT
       al.user_id,
       al.employee,
       al.project_id,
       c.name        AS customer_name,
       p.name        AS project_name,
       p.type        AS project_type,
       ROUND(SUM(al.hours), 2) AS total_hours
     FROM activity_logs al
     JOIN projects p  ON p.id = al.project_id
     JOIN customers c ON c.id = p.customer_id
     GROUP BY al.user_id, al.employee, al.project_id
     ORDER BY total_hours DESC`
  );
  return rows;
};

// ── Total hours per user (for team utilisation) ───────────────────────────
exports.totalHoursPerUser = async () => {
  const [rows] = await pool.execute(
    `SELECT
       al.user_id,
       al.employee,
       ROUND(SUM(al.hours), 2)                          AS total_hours,
       ROUND(AVG(al.hours), 2)                          AS avg_hours_per_entry,
       COUNT(DISTINCT al.logged_date)                   AS log_days,
       COUNT(DISTINCT al.project_id)                    AS project_count
     FROM activity_logs al
     GROUP BY al.user_id, al.employee
     ORDER BY total_hours DESC`
  );
  return rows;
};

// ── Recent logs (for audit / display) ────────────────────────────────────
exports.getRecent = async (limit = 50) => {
  const [rows] = await pool.query(
    `SELECT al.*, p.name AS project_name, u.name AS user_name
     FROM activity_logs al
     JOIN projects p ON p.id = al.project_id
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT ${Number(limit)}`
  );
  return rows;
};
