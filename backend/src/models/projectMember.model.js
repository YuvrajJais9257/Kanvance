"use strict";

/**
 * projectMember.model.js — Data-access layer for the `project_members` table.
 *
 * All mutation operations use soft-delete semantics: no row is ever hard-deleted.
 * Re-joining after a soft-leave sets `left_date = NULL` on the existing row via
 * INSERT … ON DUPLICATE KEY UPDATE, preserving history.
 *
 * Requirements: 2.1, 2.7, 3.1, 3.2, 11.2
 */

const pool = require("../config/db");

/**
 * Insert a new project_members row, or re-activate a former member by setting
 * `left_date = NULL` and updating `role` + `joined_date` on conflict.
 *
 * The UNIQUE KEY `uq_project_user (project_id, user_id)` ensures at most one row
 * per (project, user) pair; returning members reuse the same row.
 *
 * @param {number} projectId
 * @param {number} userId
 * @param {string} role  — one of "member", "lead", "contributor"
 * @returns {Promise<{ id: number, project_id: number, user_id: number, role: string, joined_date: string, left_date: null }>}
 *
 * Requirements: 2.1
 */
exports.insert = async (projectId, userId, role) => {
  // Use INSERT … ON DUPLICATE KEY UPDATE so re-joining simply re-activates the
  // existing row (clears left_date, refreshes joined_date and role).
  const [result] = await pool.execute(
    `INSERT INTO project_members (project_id, user_id, role, joined_date, left_date)
     VALUES (?, ?, ?, CURDATE(), NULL)
     ON DUPLICATE KEY UPDATE
       role        = VALUES(role),
       joined_date = CURDATE(),
       left_date   = NULL`,
    [projectId, userId, role]
  );

  // Fetch the inserted / updated row so the caller receives a complete record.
  const [[row]] = await pool.execute(
    `SELECT id, project_id, user_id, role, joined_date, left_date
     FROM project_members
     WHERE project_id = ? AND user_id = ?`,
    [projectId, userId]
  );
  return row;
};

/**
 * Soft-leave: set `left_date = CURRENT_DATE` for an active member.
 *
 * Only touches the row when `left_date IS NULL` (i.e. the user is still active).
 * Returns the number of affected rows (0 if the user was already inactive).
 *
 * @param {number} projectId
 * @param {number} userId
 * @returns {Promise<number>} affectedRows
 *
 * Requirements: 2.7
 */
exports.softLeave = async (projectId, userId) => {
  const [result] = await pool.execute(
    `UPDATE project_members
     SET left_date = CURDATE()
     WHERE project_id = ? AND user_id = ? AND left_date IS NULL`,
    [projectId, userId]
  );
  return result.affectedRows;
};

/**
 * Find the single Active_Member row for a (project, user) pair.
 *
 * Returns `null` when no active membership exists.
 *
 * @param {number} projectId
 * @param {number} userId
 * @returns {Promise<object | null>}
 *
 * Requirements: 2.4 (duplicate-active check), 2.8 (active-member 404)
 */
exports.findActive = async (projectId, userId) => {
  const [[row]] = await pool.execute(
    `SELECT id, project_id, user_id, role, joined_date, left_date
     FROM project_members
     WHERE project_id = ? AND user_id = ? AND left_date IS NULL`,
    [projectId, userId]
  );
  return row ?? null;
};

/**
 * List ALL members (active + former) for a project, joining user name.
 *
 * Order: active members first (left_date IS NULL) sorted by joined_date ASC,
 * then former members sorted by joined_date ASC.
 *
 * @param {number} projectId
 * @returns {Promise<Array<{ id, user_id, user_name, role, joined_date, left_date }>>}
 *
 * Requirements: 3.1, 3.2
 */
exports.listAll = async (projectId) => {
  const [rows] = await pool.execute(
    `SELECT
       pm.id,
       pm.user_id,
       u.name   AS user_name,
       pm.role,
       pm.joined_date,
       pm.left_date
     FROM project_members pm
     LEFT JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ?
     ORDER BY
       (pm.left_date IS NULL) DESC,   -- active members first (1 > 0)
       pm.joined_date ASC`,
    [projectId]
  );
  return rows;
};

/**
 * List ACTIVE members only for a project, joining user name.
 * Used by the assignable-users endpoint — returns only records where
 * `left_date IS NULL`, ordered by `user_name ASC`.
 *
 * @param {number} projectId
 * @returns {Promise<Array<{ user_id, user_name, role }>>}
 *
 * Requirements: 11.2
 */
exports.listActive = async (projectId) => {
  const [rows] = await pool.execute(
    `SELECT
       pm.user_id,
       u.name  AS user_name,
       pm.role
     FROM project_members pm
     LEFT JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? AND pm.left_date IS NULL
     ORDER BY u.name ASC`,
    [projectId]
  );
  return rows;
};

/**
 * Validate that a set of user IDs are all Active_Members of the project.
 *
 * Returns the **subset** of the provided `userIds` that ARE active members.
 * The caller computes `requestedIds − returnedIds` to find non-members.
 *
 * When `userIds` is empty the function returns an empty array immediately
 * without hitting the database.
 *
 * @param {number}   projectId
 * @param {number[]} userIds
 * @returns {Promise<number[]>} subset of userIds that are active members
 *
 * Requirements: 11.1 (membership gate used by assignment write paths)
 */
exports.validateMembers = async (projectId, userIds) => {
  if (!userIds || userIds.length === 0) return [];

  const placeholders = userIds.map(() => "?").join(", ");
  const [rows] = await pool.execute(
    `SELECT user_id
     FROM project_members
     WHERE project_id = ?
       AND user_id IN (${placeholders})
       AND left_date IS NULL`,
    [projectId, ...userIds]
  );
  return rows.map((r) => r.user_id);
};
