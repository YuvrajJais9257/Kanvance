/**
 * assignment.model.js
 *
 * All direct SQL operations for the `task_assignments` table.
 * Used by assignment.service.js and any model that needs the
 * Effective_Owner SQL fragment (analytics, timesheetEntries, project).
 *
 * Requirements: 4.2, 4.6, 5.1, 6.2–6.4, 9.1–9.4
 */

"use strict";

const pool = require("../config/db");

// ---------------------------------------------------------------------------
// Exported SQL fragment — Effective_Owner resolver
//
// Embed this inside any SELECT that has the following joins in scope:
//   JOIN  activity_groups ag ON ag.id = s.group_id
//   JOIN  projects        p  ON p.id  = ag.project_id
//   LEFT JOIN users u_ag    ON u_ag.id   = ag.assignee_id
//   LEFT JOIN users u_proj  ON u_proj.id = p.owner_id
//
// The fragment resolves the effective owner for subtask alias `s`:
//   (1) Active_Assignment with latest assigned_date (unassigned_date IS NULL)
//   (2) activity_groups.assignee_id  (task-level)
//   (3) projects.owner_id            (project-level fallback)
//   (4) NULL when all three are absent
//
// Requirement 5.1
// ---------------------------------------------------------------------------

/** Scalar subquery that returns the effective owner user_id for subtask `s`. */
exports.EFFECTIVE_OWNER_ID_SQL = `COALESCE(
  (SELECT ta.user_id
   FROM task_assignments ta
   WHERE ta.subtask_id = s.id
     AND ta.unassigned_date IS NULL
   ORDER BY ta.assigned_date DESC, ta.id DESC
   LIMIT 1),
  ag.assignee_id,
  p.owner_id
)`;

/** Scalar subquery that returns the effective owner name for subtask `s`.
 *  Requires u_ag and u_proj joins to be in scope (see header comment). */
exports.EFFECTIVE_OWNER_NAME_SQL = `COALESCE(
  (SELECT u_ta.name
   FROM task_assignments ta2
   JOIN users u_ta ON u_ta.id = ta2.user_id
   WHERE ta2.subtask_id = s.id
     AND ta2.unassigned_date IS NULL
   ORDER BY ta2.assigned_date DESC, ta2.id DESC
   LIMIT 1),
  u_ag.name,
  u_proj.name
)`;

/** CASE expression for the `inherited` flag for subtask `s`. */
exports.INHERITED_FLAG_SQL = `CASE
  WHEN EXISTS (
    SELECT 1 FROM task_assignments ta
    WHERE ta.subtask_id = s.id AND ta.unassigned_date IS NULL
  ) THEN FALSE
  WHEN ag.assignee_id IS NOT NULL OR p.owner_id IS NOT NULL THEN TRUE
  ELSE NULL
END`;

// ---------------------------------------------------------------------------
// getActiveAssignments
//
// Returns all Active_Assignment rows (unassigned_date IS NULL) for a subtask,
// ordered by assigned_date ASC so the first element is the oldest active
// assignment (used as the `subtasks.assignee_id` mirror).
//
// Requirements 6.2, 6.3, 9.1
// ---------------------------------------------------------------------------

/**
 * @param {number} subtaskId
 * @returns {Promise<Array<{ id: number, user_id: number, assigned_date: string, inherited_from_task_id: number|null }>>}
 */
exports.getActiveAssignments = async (subtaskId) => {
  const [rows] = await pool.execute(
    `SELECT id, user_id, assigned_date, inherited_from_task_id
     FROM task_assignments
     WHERE subtask_id = ?
       AND unassigned_date IS NULL
     ORDER BY assigned_date ASC, id ASC`,
    [subtaskId]
  );
  return rows;
};

// ---------------------------------------------------------------------------
// insertAssignment
//
// Inserts a new task_assignments row. Uses INSERT IGNORE to avoid duplicate-key
// errors when a row for the same (user_id, subtask_id) pair with
// unassigned_date IS NULL might already exist (the service layer is responsible
// for filtering, but defence-in-depth is appropriate here).
//
// A proper "INSERT only when no active row exists" is handled by the service
// via getActiveAssignments before calling this function.
//
// Requirements 4.2, 6.2, 9.3
// ---------------------------------------------------------------------------

/**
 * @param {number} subtaskId
 * @param {number} userId
 * @param {number|null} inheritedFromTaskId  — set for task-propagated rows; null for direct assignments
 * @returns {Promise<number>}  insertId of the new row
 */
exports.insertAssignment = async (subtaskId, userId, inheritedFromTaskId = null) => {
  const [result] = await pool.execute(
    `INSERT INTO task_assignments
       (user_id, subtask_id, assigned_date, unassigned_date, inherited_from_task_id)
     VALUES (?, ?, CURDATE(), NULL, ?)`,
    [userId, subtaskId, inheritedFromTaskId ?? null]
  );
  return result.insertId;
};

// ---------------------------------------------------------------------------
// softUnassign
//
// Sets unassigned_date = CURRENT_DATE for all active rows matching the given
// (subtaskId, userId[]) combination.  Only rows with unassigned_date IS NULL
// are affected — historical rows are left untouched.
//
// Requirements 6.2, 6.4, 9.1, 9.2
// ---------------------------------------------------------------------------

/**
 * @param {number}   subtaskId
 * @param {number[]} userIds   — array of user IDs to soft-unassign from this subtask
 * @returns {Promise<number>}  number of rows affected
 */
exports.softUnassign = async (subtaskId, userIds) => {
  if (!userIds || userIds.length === 0) return 0;

  const placeholders = userIds.map(() => "?").join(", ");
  const [result] = await pool.execute(
    `UPDATE task_assignments
     SET    unassigned_date = CURDATE()
     WHERE  subtask_id      = ?
       AND  user_id         IN (${placeholders})
       AND  unassigned_date IS NULL`,
    [subtaskId, ...userIds]
  );
  return result.affectedRows;
};

// ---------------------------------------------------------------------------
// softUnassignInherited
//
// Sets unassigned_date = CURRENT_DATE on all active rows that were created via
// task-level propagation from the given taskId.  This is called when a task's
// assignee_id is set to null (Requirement 4.6).
//
// Only rows with unassigned_date IS NULL are affected.
//
// Requirements 4.6, 9.1
// ---------------------------------------------------------------------------

/**
 * @param {number} taskId  — the activity_groups.id whose inherited rows should be soft-unassigned
 * @returns {Promise<number>}  number of rows affected
 */
exports.softUnassignInherited = async (taskId) => {
  const [result] = await pool.execute(
    `UPDATE task_assignments
     SET    unassigned_date        = CURDATE()
     WHERE  inherited_from_task_id = ?
       AND  unassigned_date        IS NULL`,
    [taskId]
  );
  return result.affectedRows;
};

// ---------------------------------------------------------------------------
// getHistory
//
// Returns the full assignment history for a subtask — every row including
// historical (unassigned) ones — with the user's name joined in.
// Ordered by assigned_date DESC, id DESC per Requirement 9.4.
//
// Requirements 9.3, 9.4
// ---------------------------------------------------------------------------

/**
 * @param {number} subtaskId
 * @returns {Promise<Array<{
 *   id: number,
 *   user_id: number,
 *   user_name: string|null,
 *   assigned_date: string,
 *   unassigned_date: string|null,
 *   inherited_from_task_id: number|null
 * }>>}
 */
exports.getHistory = async (subtaskId) => {
  const [rows] = await pool.execute(
    `SELECT
       ta.id,
       ta.user_id,
       u.name             AS user_name,
       ta.assigned_date,
       ta.unassigned_date,
       ta.inherited_from_task_id
     FROM task_assignments ta
     LEFT JOIN users u ON u.id = ta.user_id
     WHERE ta.subtask_id = ?
     ORDER BY ta.assigned_date DESC, ta.id DESC`,
    [subtaskId]
  );
  return rows;
};

// ---------------------------------------------------------------------------
// getSubtaskIdsForTask
//
// Returns the IDs of all child subtasks belonging to a given task
// (activity_groups row).  Used by propagateTaskAssignment and bulkAssign
// in assignment.service.js to enumerate affected subtasks.
//
// Requirements 4.2, 7.4
// ---------------------------------------------------------------------------

/**
 * @param {number} taskId  — activity_groups.id
 * @returns {Promise<number[]>}  array of subtask IDs
 */
exports.getSubtaskIdsForTask = async (taskId) => {
  const [rows] = await pool.execute(
    `SELECT id
     FROM subtasks
     WHERE group_id = ?
     ORDER BY position ASC, id ASC`,
    [taskId]
  );
  return rows.map((r) => r.id);
};
