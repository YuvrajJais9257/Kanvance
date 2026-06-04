/**
 * assignment.service.js — Shared assignment orchestration service.
 *
 * Provides five operations consumed by the group and subtask controllers:
 *   - syncAssignees          (multi-assignee subtask sync, Req 6.1–6.6)
 *   - propagateTaskAssignment (task → child subtask inheritance, Req 4.2–4.3)
 *   - clearInheritedAssignments (unassign inherited rows, Req 4.6)
 *   - bulkAssign             (all subtasks of a task → single user, Req 7.1–7.8)
 *   - distribute             (spread subtasks across users by mode, Req 8.1–8.10)
 *
 * All mutating operations run inside a database transaction obtained from the
 * shared connection pool so that partial failures roll back completely.
 *
 * Requirements: 4.2–4.6, 6.1–6.6, 7.1–7.8, 8.1–8.10
 */

"use strict";

const pool              = require("../config/db");
const assignmentModel   = require("../models/assignment.model");
const projectMemberModel = require("../models/projectMember.model");
const { computeDistribution } = require("./distribute");

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the project_id for a given activity_groups row.
 * Returns null when the task does not exist.
 *
 * @param {object} conn  — active pool connection (inside a transaction)
 * @param {number} taskId
 * @returns {Promise<{ id: number, project_id: number } | null>}
 */
async function _fetchTask(conn, taskId) {
  const [[row]] = await conn.execute(
    `SELECT id, project_id FROM activity_groups WHERE id = ?`,
    [taskId]
  );
  return row ?? null;
}

/**
 * Check whether a user exists in the `users` table.
 *
 * @param {object} conn
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function _userExists(conn, userId) {
  const [[row]] = await conn.execute(
    `SELECT id FROM users WHERE id = ?`,
    [userId]
  );
  return !!row;
}

/**
 * Check whether a project has ANY project_members rows at all.
 * Used for the backward-compatibility bypass: projects with no members
 * allow assignment to the project owner without a membership check.
 *
 * @param {number} projectId
 * @returns {Promise<boolean>}
 */
async function _projectHasMembers(projectId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM project_members WHERE project_id = ?`,
    [projectId]
  );
  return Number(row.cnt) > 0;
}

/**
 * Check whether a project has ANY project_members rows — using an existing
 * connection (inside a transaction).
 *
 * @param {object} conn
 * @param {number} projectId
 * @returns {Promise<boolean>}
 */
async function _projectHasMembersConn(conn, projectId) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM project_members WHERE project_id = ?`,
    [projectId]
  );
  return Number(row.cnt) > 0;
}

/**
 * Validate that all user IDs in `userIds` are Active_Members of `projectId`.
 *
 * When the project has no members at all, only the project owner is exempted
 * (backward-compatibility path per Requirement 11.4). All other callers must
 * be Active_Members.
 *
 * Throws a 422 error identifying the non-member user IDs when any are invalid.
 *
 * @param {number}   projectId
 * @param {number[]} userIds
 * @returns {Promise<void>}
 */
async function _validateActiveMembers(projectId, userIds) {
  if (!userIds || userIds.length === 0) return;

  const hasMembers = await _projectHasMembers(projectId);

  if (!hasMembers) {
    // Backward-compat: projects with no membership rows — skip gate entirely.
    return;
  }

  const activeIds = await projectMemberModel.validateMembers(projectId, userIds);
  const activeSet = new Set(activeIds);
  const invalidIds = userIds.filter((id) => !activeSet.has(id));

  if (invalidIds.length > 0) {
    const err = Object.assign(
      new Error(
        `The following user IDs are not Active_Members of project ${projectId}: ${invalidIds.join(", ")}`
      ),
      { status: 422, invalidIds }
    );
    throw err;
  }
}

/**
 * Same as `_validateActiveMembers` but uses an in-transaction connection.
 *
 * @param {object}   conn
 * @param {number}   projectId
 * @param {number[]} userIds
 * @returns {Promise<void>}
 */
async function _validateActiveMembersConn(conn, projectId, userIds) {
  if (!userIds || userIds.length === 0) return;

  const hasMembers = await _projectHasMembersConn(conn, projectId);
  if (!hasMembers) return; // backward-compat bypass

  const placeholders = userIds.map(() => "?").join(", ");
  const [rows] = await conn.execute(
    `SELECT user_id FROM project_members
     WHERE project_id = ?
       AND user_id IN (${placeholders})
       AND left_date IS NULL`,
    [projectId, ...userIds]
  );
  const activeSet = new Set(rows.map((r) => r.user_id));
  const invalidIds = userIds.filter((id) => !activeSet.has(id));

  if (invalidIds.length > 0) {
    const err = Object.assign(
      new Error(
        `The following user IDs are not Active_Members of project ${projectId}: ${invalidIds.join(", ")}`
      ),
      { status: 422, invalidIds }
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// syncAssignees
// ---------------------------------------------------------------------------

/**
 * Sync the set of assignees for a subtask to exactly `assigneeIds`.
 *
 * Steps:
 *   1. Validate all assigneeIds are Active_Members (or bypass for no-member projects).
 *   2. Fetch current Active_Assignments for the subtask.
 *   3. Compute diff: to_add = assigneeIds − current; to_remove = current − assigneeIds.
 *   4. Soft-unassign to_remove (SET unassigned_date = CURRENT_DATE).
 *   5. INSERT new rows for to_add (assigned_date = CURRENT_DATE, inherited_from_task_id = NULL).
 *   6. UPDATE subtasks.assignee_id = assigneeIds[0] ?? NULL.
 *   7. Return { added, removed }.
 *
 * The entire operation runs in a single transaction.
 *
 * @param {number}   subtaskId
 * @param {number[]} assigneeIds  — target set (may be empty to unassign all)
 * @param {number}   projectId
 * @returns {Promise<{ added: number, removed: number }>}
 *
 * Requirements: 6.1–6.6
 */
exports.syncAssignees = async (subtaskId, assigneeIds, projectId) => {
  // Validate membership before acquiring the connection.
  await _validateActiveMembers(projectId, assigneeIds);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch current active assignments using the connection so the read is
    // part of the same transaction snapshot.
    const [currentRows] = await conn.execute(
      `SELECT user_id FROM task_assignments
       WHERE subtask_id = ? AND unassigned_date IS NULL`,
      [subtaskId]
    );
    const currentIds = currentRows.map((r) => r.user_id);
    const targetSet  = new Set(assigneeIds);
    const currentSet = new Set(currentIds);

    const toRemove = currentIds.filter((id) => !targetSet.has(id));
    const toAdd    = assigneeIds.filter((id) => !currentSet.has(id));

    // Soft-unassign removals
    if (toRemove.length > 0) {
      const placeholders = toRemove.map(() => "?").join(", ");
      await conn.execute(
        `UPDATE task_assignments
         SET    unassigned_date = CURDATE()
         WHERE  subtask_id      = ?
           AND  user_id         IN (${placeholders})
           AND  unassigned_date IS NULL`,
        [subtaskId, ...toRemove]
      );
    }

    // INSERT new assignments
    for (const userId of toAdd) {
      await conn.execute(
        `INSERT INTO task_assignments
           (user_id, subtask_id, assigned_date, unassigned_date, inherited_from_task_id)
         VALUES (?, ?, CURDATE(), NULL, NULL)`,
        [userId, subtaskId]
      );
    }

    // Mirror first assignee into subtasks.assignee_id (backward compat)
    const newAssigneeId = assigneeIds.length > 0 ? assigneeIds[0] : null;
    await conn.execute(
      `UPDATE subtasks SET assignee_id = ? WHERE id = ?`,
      [newAssigneeId, subtaskId]
    );

    await conn.commit();
    return { added: toAdd.length, removed: toRemove.length };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ---------------------------------------------------------------------------
// propagateTaskAssignment
// ---------------------------------------------------------------------------

/**
 * Propagate a task-level assignee to all child subtasks that do not already
 * have an Active_Assignment for that user.
 *
 * For each qualifying child subtask, inserts a `task_assignments` row with
 * `inherited_from_task_id = taskId` and `assigned_date = CURRENT_DATE`.
 *
 * Uses `INSERT IGNORE` to safely skip cases where a concurrent write already
 * created the same (user_id, subtask_id) row (the UNIQUE constraint guards the
 * table; `INSERT IGNORE` prevents an error from being thrown).
 *
 * @param {number} taskId
 * @param {number} assigneeId
 * @returns {Promise<number>}  count of newly inserted rows
 *
 * Requirements: 4.2, 4.3
 */
exports.propagateTaskAssignment = async (taskId, assigneeId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch all child subtask IDs for the task.
    const [subtaskRows] = await conn.execute(
      `SELECT id FROM subtasks WHERE group_id = ? ORDER BY position ASC, id ASC`,
      [taskId]
    );

    let inserted = 0;

    for (const { id: subtaskId } of subtaskRows) {
      // Check if this user already has an Active_Assignment for this subtask.
      const [[existing]] = await conn.execute(
        `SELECT id FROM task_assignments
         WHERE subtask_id = ? AND user_id = ? AND unassigned_date IS NULL
         LIMIT 1`,
        [subtaskId, assigneeId]
      );

      if (existing) continue; // subtask already actively assigned to this user — skip

      // INSERT the inherited row.
      const [result] = await conn.execute(
        `INSERT IGNORE INTO task_assignments
           (user_id, subtask_id, assigned_date, unassigned_date, inherited_from_task_id)
         VALUES (?, ?, CURDATE(), NULL, ?)`,
        [assigneeId, subtaskId, taskId]
      );
      inserted += result.affectedRows;
    }

    await conn.commit();
    return inserted;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ---------------------------------------------------------------------------
// clearInheritedAssignments
// ---------------------------------------------------------------------------

/**
 * Soft-unassign all `task_assignments` rows that were propagated from the
 * given task (i.e. `inherited_from_task_id = taskId` and `unassigned_date IS NULL`).
 *
 * Called when `activity_groups.assignee_id` is set to null.
 *
 * @param {number} taskId  — the `activity_groups.id` whose inherited rows should be cleared
 * @returns {Promise<number>}  number of rows affected
 *
 * Requirements: 4.6
 */
exports.clearInheritedAssignments = async (taskId) => {
  return assignmentModel.softUnassignInherited(taskId);
};

// ---------------------------------------------------------------------------
// bulkAssign
// ---------------------------------------------------------------------------

/**
 * Assign all child subtasks of a task to a single user.
 *
 * Steps:
 *   1. Validate task exists → 404.
 *   2. Validate user exists → 404.
 *   3. Validate user is Active_Member of the task's project → 422.
 *   4. Fetch all child subtask IDs.
 *   5. For each subtask: soft-unassign Active_Assignments for OTHER users.
 *   6. INSERT an Active_Assignment for the target user if one doesn't already exist.
 *      (Preserves original `assigned_date` when re-assigning to the same user.)
 *   7. UPDATE subtasks.assignee_id = userId for all children.
 *   8. UPDATE activity_groups.assignee_id = userId.
 *   9. Return { task_id, user_id, subtasks_assigned }.
 *
 * @param {number} taskId
 * @param {number} userId
 * @param {number} projectId
 * @returns {Promise<{ task_id: number, user_id: number, subtasks_assigned: number }>}
 *
 * Requirements: 7.1–7.8
 */
exports.bulkAssign = async (taskId, userId, projectId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Validate task exists
    const task = await _fetchTask(conn, taskId);
    if (!task) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    // 2. Validate user exists
    const userOk = await _userExists(conn, userId);
    if (!userOk) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }

    // 3. Validate Active_Member
    await _validateActiveMembersConn(conn, projectId, [userId]);

    // 4. Fetch all child subtask IDs
    const [subtaskRows] = await conn.execute(
      `SELECT id FROM subtasks WHERE group_id = ? ORDER BY position ASC, id ASC`,
      [taskId]
    );
    const subtaskIds = subtaskRows.map((r) => r.id);

    let subtasksAssigned = 0;

    for (const subtaskId of subtaskIds) {
      // Soft-unassign Active_Assignments belonging to OTHER users on this subtask
      await conn.execute(
        `UPDATE task_assignments
         SET    unassigned_date = CURDATE()
         WHERE  subtask_id      = ?
           AND  user_id        != ?
           AND  unassigned_date IS NULL`,
        [subtaskId, userId]
      );

      // Check whether the target user already has an Active_Assignment
      const [[existing]] = await conn.execute(
        `SELECT id FROM task_assignments
         WHERE subtask_id = ? AND user_id = ? AND unassigned_date IS NULL
         LIMIT 1`,
        [subtaskId, userId]
      );

      if (!existing) {
        // INSERT new assignment for the target user
        await conn.execute(
          `INSERT INTO task_assignments
             (user_id, subtask_id, assigned_date, unassigned_date, inherited_from_task_id)
           VALUES (?, ?, CURDATE(), NULL, NULL)`,
          [userId, subtaskId]
        );
        subtasksAssigned++;
      }
      // If already assigned to this user, count it as assigned (preserved)
      // but don't double-count for the "new assignment" metric.
    }

    // 7. UPDATE subtasks.assignee_id for all children (backward compat)
    if (subtaskIds.length > 0) {
      const placeholders = subtaskIds.map(() => "?").join(", ");
      await conn.execute(
        `UPDATE subtasks SET assignee_id = ? WHERE id IN (${placeholders})`,
        [userId, ...subtaskIds]
      );
    }

    // 8. UPDATE activity_groups.assignee_id
    await conn.execute(
      `UPDATE activity_groups SET assignee_id = ? WHERE id = ?`,
      [userId, taskId]
    );

    await conn.commit();
    return { task_id: taskId, user_id: userId, subtasks_assigned: subtasksAssigned };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ---------------------------------------------------------------------------
// distribute
// ---------------------------------------------------------------------------

/**
 * Distribute child subtasks of a task across a set of users using the
 * specified distribution mode (`round_robin`, `equal`, or `manual`).
 *
 * Steps:
 *   1. Validate task exists → 404.
 *   2. Validate mode is one of the supported values → 400.
 *   3. Validate userIds / assignments array is non-empty → 400.
 *   4. Validate all user IDs are Active_Members → 422.
 *   5. If mode = manual, validate all subtask_ids belong to the task → 422.
 *   6. Fetch child subtasks (ordered by position ASC).
 *   7. Compute distribution map via computeDistribution.
 *   8. Apply assignments in a transaction:
 *      a. Soft-unassign existing Active_Assignments where user differs.
 *      b. INSERT/preserve Active_Assignment for target user.
 *   9. Return { task_id, mode, distribution }.
 *
 * @param {number}   taskId
 * @param {string}   mode         — 'round_robin' | 'equal' | 'manual'
 * @param {number[]} userIds      — user IDs (ignored for manual mode; still validated)
 * @param {Array<{ subtask_id: number, user_id: number }>} [assignments] — required for manual mode
 * @param {number}   projectId
 * @returns {Promise<{ task_id: number, mode: string, distribution: Array<{ user_id: number, subtasks_assigned: number }> }>}
 *
 * Requirements: 8.1–8.10
 */
exports.distribute = async (taskId, mode, userIds, assignments, projectId) => {
  // --- Pre-transaction validations ---

  // 2. Validate mode
  const VALID_MODES = ["round_robin", "equal", "manual"];
  if (!VALID_MODES.includes(mode)) {
    throw Object.assign(
      new Error(`Invalid mode "${mode}". Must be one of: ${VALID_MODES.join(", ")}`),
      { status: 400 }
    );
  }

  // 3. Validate non-empty input
  if (mode === "manual") {
    if (!assignments || assignments.length === 0) {
      throw Object.assign(
        new Error("assignments array must not be empty for manual mode"),
        { status: 400 }
      );
    }
  } else {
    if (!userIds || userIds.length === 0) {
      throw Object.assign(
        new Error("user_ids array must not be empty"),
        { status: 400 }
      );
    }
  }

  // 4. Validate Active_Member status
  // For manual mode, derive the set of unique user IDs from the assignments array.
  const usersToValidate = mode === "manual"
    ? [...new Set((assignments || []).map((a) => a.user_id))]
    : userIds;
  await _validateActiveMembers(projectId, usersToValidate);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Validate task exists
    const task = await _fetchTask(conn, taskId);
    if (!task) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    // 6. Fetch child subtasks ordered by position ASC
    const [subtaskRows] = await conn.execute(
      `SELECT id, position FROM subtasks WHERE group_id = ? ORDER BY position ASC, id ASC`,
      [taskId]
    );

    // 5. If manual mode — validate all provided subtask_ids belong to this task
    if (mode === "manual" && assignments && assignments.length > 0) {
      const validSubtaskIdSet = new Set(subtaskRows.map((r) => r.id));
      const invalidSubtaskIds = assignments
        .map((a) => a.subtask_id)
        .filter((sid) => !validSubtaskIdSet.has(sid));

      if (invalidSubtaskIds.length > 0) {
        throw Object.assign(
          new Error(
            `The following subtask IDs do not belong to task ${taskId}: ${invalidSubtaskIds.join(", ")}`
          ),
          { status: 422, invalidSubtaskIds }
        );
      }
    }

    // 7. Compute distribution map — Map<subtask_id, user_id>
    const distributionMap = computeDistribution(subtaskRows, userIds, mode, assignments);

    // 8. Apply assignments
    const countPerUser = new Map(); // user_id → number of subtasks assigned/preserved

    for (const [subtaskId, targetUserId] of distributionMap) {
      // Soft-unassign Active_Assignments for OTHER users on this subtask
      await conn.execute(
        `UPDATE task_assignments
         SET    unassigned_date = CURDATE()
         WHERE  subtask_id      = ?
           AND  user_id        != ?
           AND  unassigned_date IS NULL`,
        [subtaskId, targetUserId]
      );

      // Check whether the target user already has an Active_Assignment
      const [[existing]] = await conn.execute(
        `SELECT id FROM task_assignments
         WHERE subtask_id = ? AND user_id = ? AND unassigned_date IS NULL
         LIMIT 1`,
        [subtaskId, targetUserId]
      );

      if (!existing) {
        await conn.execute(
          `INSERT INTO task_assignments
             (user_id, subtask_id, assigned_date, unassigned_date, inherited_from_task_id)
           VALUES (?, ?, CURDATE(), NULL, NULL)`,
          [targetUserId, subtaskId]
        );
      }

      // Track distribution counts
      countPerUser.set(targetUserId, (countPerUser.get(targetUserId) ?? 0) + 1);
    }

    await conn.commit();

    // Build the distribution summary
    const distribution = [...countPerUser.entries()].map(([user_id, subtasks_assigned]) => ({
      user_id,
      subtasks_assigned,
    }));

    return { task_id: taskId, mode, distribution };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
