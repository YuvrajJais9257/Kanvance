/**
 * timesheetAutofill.model.js
 *
 * DB queries for the Excel Timesheet Auto-Fill feature.
 *
 * All queries use parameterised statements (pool.execute) — no string
 * interpolation with user-supplied values.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.8
 */

"use strict";

const pool = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// getEmployeeActivity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve all projects, activity_groups (as TaskEntry objects with subtasks),
 * and time_logs that are relevant to a given employee within a date range.
 *
 * Returns an EmployeeActivity object:
 *   {
 *     projects:  Array<{ id, name, customerId, ownerId, type, status }>,
 *     tasks:     Array<TaskEntry>,   // activity_groups with subtasks
 *     timeLogs:  Array<TimeLogEntry>
 *   }
 *
 * TaskEntry shape:
 *   {
 *     taskId, taskTitle, projectId, projectName, isOrphan,
 *     subtasks: [ { subtaskId, title, status, closedAt, isOrphan } ]
 *   }
 *
 * Date-range inclusion logic (Req 3.2):
 *   A subtask is included if:
 *     - its status = 'Done' (proxy for closed, since no closed_at column) AND
 *       its due_date falls within [fromDate, toDate], OR
 *     - at least one time_log entry for that subtask (matched by
 *       project_name + activity_group + subtask_name) has a `date` within
 *       [fromDate, toDate].
 *
 * Unassigned subtask attribution (Req 3.3):
 *   Subtasks with null `assignee_id` are attributed to the project `owner_id`.
 *
 * Orphan detection (Req 3.4):
 *   Any subtask whose parent activity_group or project no longer exists will
 *   have `isOrphan = true` and appear under a synthetic `[Orphaned]` task.
 *
 * Task reassignment (Req 3.5):
 *   Because the DB stores only the current `assignee_id` (no history table),
 *   closed subtasks are attributed to the current holder (who closed it).
 *   Open subtasks are attributed to the current `assignee_id`.
 *
 * @param {number} userId    — DB user id of the employee
 * @param {string} fromDate  — inclusive start, YYYY-MM-DD
 * @param {string} toDate    — inclusive end,   YYYY-MM-DD
 * @returns {Promise<{
 *   projects:  Array<object>,
 *   tasks:     Array<object>,
 *   timeLogs:  Array<object>,
 * }>}
 */
exports.getEmployeeActivity = async (userId, fromDate, toDate) => {
  // ── 1. Fetch subtasks relevant to this employee in the date range ──────────
  //
  // A subtask is relevant to the employee if:
  //   (a) s.assignee_id = userId, OR
  //   (b) s.assignee_id IS NULL AND p.owner_id = userId  (Req 3.3)
  //
  // AND the subtask falls within the date range:
  //   (c) s.status = 'Done' AND s.due_date BETWEEN fromDate AND toDate
  //       (no closed_at column — use status='Done' as proxy for closed), OR
  //   (d) at least one time_log entry matches (project_name + activity_group +
  //       subtask_name) AND has date BETWEEN fromDate AND toDate  (Req 3.2)
  //
  // We LEFT JOIN projects + activity_groups to allow orphan detection (Req 3.4).

  const [subtaskRows] = await pool.execute(
    `SELECT
       s.id                                                        AS subtask_id,
       s.group_id,
       s.name                                                      AS subtask_name,
       s.status,
       s.due_date,
       s.assignee_id,
       s.position,
       -- Effective assignee: fall back to project owner when unassigned (Req 3.3)
       COALESCE(s.assignee_id, p.owner_id)                        AS effective_assignee_id,
       ag.id                                                       AS activity_group_id,
       ag.name                                                     AS activity_group_name,
       ag.project_id,
       p.id                                                        AS project_id_val,
       p.name                                                      AS project_name,
       p.owner_id,
       p.customer_id,
       p.type                                                      AS project_type,
       p.status                                                    AS project_status,
       -- Orphan flag: true when the parent group or project is missing (Req 3.4)
       CASE
         WHEN ag.id IS NULL OR p.id IS NULL THEN TRUE
         ELSE FALSE
       END                                                         AS is_orphan
     FROM subtasks s
     LEFT JOIN activity_groups ag ON ag.id = s.group_id
     LEFT JOIN projects p         ON p.id  = ag.project_id
     WHERE
       -- Employee filter (Req 3.3)
       (
         s.assignee_id = ?
         OR (s.assignee_id IS NULL AND p.owner_id = ?)
       )
       AND
       -- Date-range inclusion (Req 3.2): status=Done+due_date in range OR time_log in range
       (
         (
           s.status = 'Done'
           AND s.due_date IS NOT NULL
           AND s.due_date BETWEEN ? AND ?
         )
         OR EXISTS (
           SELECT 1
           FROM time_logs tl
           WHERE tl.employee_id = ?
             AND tl.project_name   = p.name
             AND tl.activity_group = ag.name
             AND tl.subtask_name   = s.name
             AND tl.date BETWEEN ? AND ?
         )
       )
     ORDER BY ag.project_id, COALESCE(ag.position, 0), COALESCE(s.position, 0)`,
    [
      userId, userId,      // employee filter
      fromDate, toDate,    // due_date (Done proxy) range
      userId,              // time_log employee_id
      fromDate, toDate,    // time_log date range
    ]
  );

  // ── 2. Fetch time_logs for this employee in the date range ─────────────────
  const [timeLogs] = await pool.execute(
    `SELECT
       tl.id,
       tl.employee_id,
       tl.project_name,
       tl.activity_group,
       tl.subtask_name,
       tl.date,
       tl.hours,
       tl.source
     FROM time_logs tl
     WHERE tl.employee_id = ?
       AND tl.date BETWEEN ? AND ?
     ORDER BY tl.date, tl.id`,
    [userId, fromDate, toDate]
  );

  // ── 3. Assemble projects list (unique, non-orphan projects) ────────────────
  const projectMap = new Map();
  for (const row of subtaskRows) {
    if (!row.is_orphan && row.project_id_val != null && !projectMap.has(row.project_id_val)) {
      projectMap.set(row.project_id_val, {
        id:         row.project_id_val,
        name:       row.project_name,
        customerId: row.customer_id,
        ownerId:    row.owner_id,
        type:       row.project_type,
        status:     row.project_status,
      });
    }
  }
  const projects = Array.from(projectMap.values());

  // ── 4. Assemble tasks list (activity_groups with subtasks as TaskEntry) ────
  //
  // Group subtasks under their parent activity_group.
  // Orphan subtasks are collected under a synthetic task with isOrphan=true.

  const taskMap = new Map();   // key: activity_group_id (or 'orphaned')

  for (const row of subtaskRows) {
    const subtaskEntry = {
      subtaskId: row.subtask_id,
      title:     row.subtask_name,
      status:    row.status,
      // Use due_date as the closed proxy; null for non-Done tasks
      closedAt:  row.status === "Done" ? (row.due_date ?? null) : null,
      isOrphan:  Boolean(row.is_orphan),
    };

    if (row.is_orphan) {
      // All orphan subtasks go under the synthetic '[Orphaned]' task (Req 3.4)
      const orphanKey = "__orphaned__";
      if (!taskMap.has(orphanKey)) {
        taskMap.set(orphanKey, {
          taskId:      null,
          taskTitle:   "[Orphaned]",
          projectId:   null,
          projectName: "[Orphaned]",
          isOrphan:    true,
          subtasks:    [],
        });
      }
      taskMap.get(orphanKey).subtasks.push(subtaskEntry);
    } else {
      const groupKey = row.activity_group_id;
      if (!taskMap.has(groupKey)) {
        taskMap.set(groupKey, {
          taskId:      row.activity_group_id,
          taskTitle:   row.activity_group_name,
          projectId:   row.project_id_val,
          projectName: row.project_name,
          isOrphan:    false,
          subtasks:    [],
        });
      }
      taskMap.get(groupKey).subtasks.push(subtaskEntry);
    }
  }

  const tasks = Array.from(taskMap.values());

  return { projects, tasks, timeLogs };
};

// ─────────────────────────────────────────────────────────────────────────────
// getTimesheetRows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return existing timesheet_rows for a given employee and date range,
 * including all five autofill columns added by the migration.
 *
 * The `employee` column in timesheet_rows stores the employee name string
 * as written by the upload pipeline.  Because the autofill model works with
 * user IDs, we join to the users table to match by id and filter by name.
 *
 * @param {number} userId
 * @param {string} fromDate  — YYYY-MM-DD
 * @param {string} toDate    — YYYY-MM-DD
 * @returns {Promise<Array<object>>}
 */
exports.getTimesheetRows = async (userId, fromDate, toDate) => {
  const [rows] = await pool.execute(
    `SELECT
       tr.id,
       tr.run_id,
       tr.row_num,
       tr.logged_date,
       tr.employee,
       tr.project_id,
       tr.project_name,
       tr.task_name,
       tr.subtask_name,
       tr.hours_uploaded,
       tr.hours_db,
       tr.hours_final,
       tr.status_uploaded,
       tr.status_db,
       tr.status_final,
       tr.notes,
       tr.matched,
       -- New autofill columns (Req 1.1–1.5)
       tr.entry_source,
       tr.source_task_ids,
       tr.last_auto_fill_at,
       tr.last_confirmed_at,
       tr.is_confirmed
     FROM timesheet_rows tr
     -- Match rows belonging to this user by joining through the users table
     JOIN users u ON u.name = tr.employee
     WHERE u.id = ?
       AND tr.logged_date BETWEEN ? AND ?
     ORDER BY tr.logged_date ASC`,
    [userId, fromDate, toDate]
  );
  return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// upsertTimesheetRow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new timesheet row, or update Columns C/D/E only when the existing
 * row has `is_confirmed = FALSE`.  Column F (notes / manager remarks) is never
 * touched.
 *
 * Lookup key: employee name (looked up from userId) + logged_date.
 *
 * Insert path (Req 8.1):
 *   - Inserts a fresh row with all supplied fields.
 *   - Sets entry_source = 'auto_generated' and last_auto_fill_at = NOW().
 *
 * Update path (Req 8.2, 8.4):
 *   - Only updates task_name (Col C), subtask_name (Col D), status_final (Col E),
 *     source_task_ids, entry_source, and last_auto_fill_at.
 *   - Guarded by `WHERE is_confirmed = FALSE` so confirmed rows are never
 *     touched (Req 8.3).
 *   - notes (Column F equivalent) is intentionally never written (Req 8.5).
 *
 * @param {object} row
 * @param {number}      row.userId          — DB user id (used to look up employeeName if not provided)
 * @param {string}      row.employeeName    — employee name string (stored in timesheet_rows.employee)
 * @param {string}      row.date            — YYYY-MM-DD (maps to logged_date)
 * @param {string|null} row.dayOfWeek       — "Monday" … "Sunday" (informational, not stored separately)
 * @param {string|null} row.columnC         — task_name content
 * @param {string|null} row.columnD         — subtask_name content
 * @param {string|null} row.columnE         — status_final content
 * @param {string|null} row.sourceTaskIds   — comma-separated task IDs
 * @returns {Promise<{ inserted: boolean, updated: boolean, skipped: boolean }>}
 */
exports.upsertTimesheetRow = async (row) => {
  const {
    userId,
    employeeName,
    date,
    columnC,
    columnD,
    columnE,
    sourceTaskIds,
  } = row;

  // Resolve the employee name: prefer the explicitly provided name, otherwise
  // look it up from the users table using userId.
  let resolvedName = employeeName ?? null;
  if (!resolvedName && userId != null) {
    const [[user]] = await pool.execute(
      "SELECT name FROM users WHERE id = ?",
      [userId]
    );
    resolvedName = user ? user.name : null;
  }

  if (!resolvedName || !date) {
    throw new Error("upsertTimesheetRow: employeeName (or resolvable userId) and date are required");
  }

  // ── Check for an existing row for this employee + date ─────────────────────
  const [[existing]] = await pool.execute(
    `SELECT id, is_confirmed
     FROM timesheet_rows
     WHERE employee = ? AND logged_date = ?
     ORDER BY id DESC
     LIMIT 1`,
    [resolvedName, date]
  );

  if (existing) {
    if (existing.is_confirmed) {
      // Confirmed row — skip entirely (Req 8.3)
      return { inserted: false, updated: false, skipped: true };
    }

    // Unconfirmed row — update C/D/E only; never touch notes (Req 8.2, 8.4, 8.5)
    const [result] = await pool.execute(
      `UPDATE timesheet_rows
       SET
         task_name         = ?,
         subtask_name      = ?,
         status_final      = ?,
         source_task_ids   = ?,
         entry_source      = 'auto_generated',
         last_auto_fill_at = NOW()
         -- notes (Column F) is intentionally omitted (Req 8.5)
       WHERE id = ?
         AND is_confirmed = FALSE`,
      [
        columnC      ?? null,
        columnD      ?? null,
        columnE      ?? null,
        sourceTaskIds ?? null,
        existing.id,
      ]
    );

    if (result.affectedRows > 0) {
      return { inserted: false, updated: true, skipped: false };
    }
    // Race condition: confirmed between SELECT and UPDATE — treat as skipped
    return { inserted: false, updated: false, skipped: true };
  }

  // ── Insert new row (Req 8.1) ───────────────────────────────────────────────
  const [insertResult] = await pool.execute(
    `INSERT INTO timesheet_rows
       (logged_date, employee,
        task_name, subtask_name, status_final,
        matched,
        entry_source, source_task_ids, last_auto_fill_at, is_confirmed)
     VALUES
       (?, ?,
        ?, ?, ?,
        0,
        'auto_generated', ?, NOW(), FALSE)`,
    [
      date,
      resolvedName,
      columnC      ?? null,
      columnD      ?? null,
      columnE      ?? null,
      sourceTaskIds ?? null,
    ]
  );

  return { inserted: insertResult.affectedRows > 0, updated: false, skipped: false };
};

// ─────────────────────────────────────────────────────────────────────────────
// resetConfirmationForTask
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When a task that contributed to a confirmed row is reopened in the DB,
 * reset `is_confirmed = FALSE` on all rows whose `source_task_ids` contains
 * that task's ID (Req 8.8).
 *
 * `source_task_ids` is a comma-separated string of integer task IDs stored
 * as TEXT, e.g. "12,47,103".  We use FIND_IN_SET which handles comma-
 * delimited strings without requiring JSON functions.
 *
 * @param {number} taskId
 * @returns {Promise<{ affected: number }>}
 */
exports.resetConfirmationForTask = async (taskId) => {
  const [result] = await pool.execute(
    `UPDATE timesheet_rows
     SET is_confirmed = FALSE
     WHERE is_confirmed = TRUE
       AND FIND_IN_SET(?, source_task_ids) > 0`,
    [String(taskId)]
  );
  return { affected: result.affectedRows };
};
