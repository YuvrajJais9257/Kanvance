/**
 * timesheetEntries.model.js
 *
 * Data-access layer for the timesheet_entries table.
 * All queries use pool.execute() with parameterised ? placeholders.
 */
const pool = require("../config/db");

// ── create ────────────────────────────────────────────────────────────────
/**
 * Insert a new timesheet entry and return the full inserted row.
 *
 * @param {{ user_id: number, subtask_id: number, date: string,
 *            hours_logged: number, time_type: string, remarks?: string }} data
 * @returns {Promise<object>} The inserted row
 */
exports.create = async ({
  user_id,
  subtask_id,
  date,
  hours_logged,
  time_type,
  remarks,
}) => {
  const [result] = await pool.execute(
    `INSERT INTO timesheet_entries
       (user_id, subtask_id, date, hours_logged, time_type, remarks)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      subtask_id,
      date,
      hours_logged,
      time_type ?? "Billable",
      remarks ?? null,
    ]
  );
  return exports.findById(result.insertId);
};

// ── findById ──────────────────────────────────────────────────────────────
/**
 * Fetch a single entry by primary key.
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
exports.findById = async (id) => {
  const [[row]] = await pool.execute(
    "SELECT * FROM timesheet_entries WHERE id = ?",
    [id],
  );
  return row ?? null;
};

// ── list ──────────────────────────────────────────────────────────────────
/**
 * Return entries matching the given filters, ordered by date ASC.
 * user_id is always required; the remaining filters are optional.
 *
 * @param {{ userId: number, dateFrom?: string, dateTo?: string, subtaskId?: number }} params
 * @returns {Promise<Array<object>>}
 */
exports.list = async ({ userId, dateFrom, dateTo, subtaskId } = {}) => {
  const conditions = ["te.user_id = ?"];
  const params = [userId];

  if (dateFrom && dateTo) {
    conditions.push("te.date BETWEEN ? AND ?");
    params.push(dateFrom, dateTo);
  }

  if (subtaskId != null) {
    conditions.push("te.subtask_id = ?");
    params.push(subtaskId);
  }

  const where = conditions.join(" AND ");
  const [rows] = await pool.execute(
    `SELECT * FROM timesheet_entries te WHERE ${where} ORDER BY te.date ASC`,
    params,
  );
  return rows;
};

// ── grid ──────────────────────────────────────────────────────────────────
/**
 * Return flat rows resolving effective assignment ownership via a three-branch
 * UNION (direct Active_Assignment → task-level inherited → project-level
 * inherited), then joining subtasks → activity_groups → projects and
 * LEFT JOINing timesheet_entries for the requested date range.
 * Shaping into the nested project/task/subtask/entries structure is done
 * in the controller.
 *
 * The userId parameter is bound three times — once per UNION branch.
 *
 * @param {{ userId: number, dateFrom: string, dateTo: string }} params
 * @returns {Promise<Array<object>>}
 */
exports.grid = async ({ userId, dateFrom, dateTo }) => {
  const [rows] = await pool.execute(
    `SELECT
       p.id                AS project_id,
       p.name              AS project_name,
       ag.id               AS task_id,
       ag.name             AS task_name,
       ag.position         AS task_position,
       s.id                AS subtask_id,
       s.name              AS subtask_name,
       s.position          AS subtask_position,
       te.id               AS entry_id,
       te.date,
       te.hours_logged,
       te.time_type,
       te.remarks
     FROM (
       -- Branch 1: Direct Active_Assignments
       SELECT subtask_id, user_id, 'direct' AS source
       FROM task_assignments
       WHERE user_id = ? AND unassigned_date IS NULL

       UNION

       -- Branch 2: Task-level inherited — subtasks with no Active_Assignment
       --           where the parent task's assignee_id matches userId
       SELECT s.id AS subtask_id, ag.assignee_id AS user_id, 'task_inherited' AS source
       FROM subtasks s
       JOIN activity_groups ag ON ag.id = s.group_id
       WHERE ag.assignee_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM task_assignments ta2
           WHERE ta2.subtask_id = s.id AND ta2.unassigned_date IS NULL
         )

       UNION

       -- Branch 3: Project-level inherited — subtasks with no Active_Assignment
       --           and no task assignee where the project owner matches userId
       SELECT s.id AS subtask_id, p.owner_id AS user_id, 'project_inherited' AS source
       FROM subtasks s
       JOIN activity_groups ag ON ag.id = s.group_id
       JOIN projects p         ON p.id  = ag.project_id
       WHERE p.owner_id = ?
         AND ag.assignee_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM task_assignments ta2
           WHERE ta2.subtask_id = s.id AND ta2.unassigned_date IS NULL
         )
     ) effective_assignments
     JOIN subtasks s          ON s.id   = effective_assignments.subtask_id
     JOIN activity_groups ag  ON ag.id  = s.group_id
     JOIN projects p          ON p.id   = ag.project_id
     LEFT JOIN timesheet_entries te
       ON  te.subtask_id = effective_assignments.subtask_id
       AND te.user_id    = effective_assignments.user_id
       AND te.date BETWEEN ? AND ?
     ORDER BY p.name ASC, ag.position ASC, s.position ASC, te.date ASC`,
    [userId, userId, userId, dateFrom, dateTo],
  );
  return rows;
};

// ── update ────────────────────────────────────────────────────────────────
/**
 * Update allowed fields (hours_logged, time_type, remarks) for an entry.
 * Only fields present in data are included in the SET clause.
 *
 * @param {number} id
 * @param {{ hours_logged?: number, time_type?: string, remarks?: string }} data
 * @returns {Promise<object|null>} The updated row, or null if id not found
 */
exports.update = async (id, data) => {
  const allowed = ["hours_logged", "time_type", "remarks"];
  const keys = Object.keys(data).filter((k) => allowed.includes(k));
  if (!keys.length) return exports.findById(id);

  const setClauses = keys.map((k) => `${k} = ?`).join(", ");
  const values = [...keys.map((k) => data[k] ?? null), id];

  await pool.execute(
    `UPDATE timesheet_entries SET ${setClauses} WHERE id = ?`,
    values,
  );
  return exports.findById(id);
};

// ── remove ────────────────────────────────────────────────────────────────
/**
 * Delete a timesheet entry by id.
 *
 * @param {number} id
 * @returns {Promise<{ affectedRows: number }>}
 */
exports.remove = async (id) => {
  const [result] = await pool.execute(
    "DELETE FROM timesheet_entries WHERE id = ?",
    [id],
  );
  return { affectedRows: result.affectedRows };
};

// ── dailyTotal ────────────────────────────────────────────────────────────
/**
 * Return the sum of hours_logged for a given user on a given date.
 * Returns 0 when no entries exist for that day.
 *
 * @param {number} userId
 * @param {string} date  — YYYY-MM-DD
 * @returns {Promise<number>}
 */
exports.dailyTotal = async (userId, date) => {
  const [[row]] = await pool.execute(
    `SELECT COALESCE(SUM(hours_logged), 0) AS day_total
     FROM timesheet_entries
     WHERE user_id = ? AND date = ?`,
    [userId, date],
  );
  return Number(row.day_total);
};
