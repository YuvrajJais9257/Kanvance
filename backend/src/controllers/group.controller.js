"use strict";

/**
 * group.controller.js
 *
 * HTTP handlers for activity_group (task) endpoints.
 *
 * Extended with:
 *   POST /api/groups/:taskId/bulk-assign  → bulkAssign (MANAGER+)
 *   POST /api/groups/:taskId/distribute   → distribute  (MANAGER+)
 *
 * Role enforcement for the new handlers mirrors the pattern used in
 * projectMember.controller.js — inline check via `getEffectiveRole`
 * so that 403 is returned before any service work begins.
 *
 * Service errors carry a `.status` property (404 / 422 / 400) which is
 * forwarded to the central error middleware via `next(err)`.
 *
 * Requirements: 7.1–7.8, 8.1–8.10
 */

const GroupService      = require("../services/group.service");
const AssignmentService = require("../services/assignment.service");
const { getEffectiveRole } = require("../middlewares/requireRole");

// Roles allowed to perform bulk-assign and distribute operations.
const MANAGER_ROLES = ["MANAGER", "ADMIN", "MASTER_ADMIN"];

/**
 * Verify the caller holds MANAGER+ role.
 * Writes a 401/403 response and returns false when the check fails.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @returns {boolean}
 */
function checkManagerRole(req, res) {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }

  const effectiveRole = getEffectiveRole(req.session);
  if (!MANAGER_ROLES.includes(effectiveRole)) {
    res.status(403).json({
      error: `Forbidden — requires one of: ${MANAGER_ROLES.join(", ")}`,
    });
    return false;
  }

  return true;
}

exports.create = async (req, res, next) => {
  try {
    const result = await GroupService.create(req.params.pid, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    await GroupService.update(req.params.id, req.body);
    res.json({ updated: true });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const subtasksDeleted = await GroupService.remove(req.params.id);
    res.json({ deleted: true, subtasks_deleted: subtasksDeleted });
  } catch (err) { next(err); }
};

/**
 * POST /api/groups/:taskId/bulk-assign
 *
 * Assign all child subtasks of the given task to a single user.
 *
 * Path params: taskId
 * Body:        { user_id: number }
 *
 * Responses:
 *   200 — { task_id, user_id, subtasks_assigned }
 *   400 — missing required body field (`user_id`)
 *   401 — not authenticated
 *   403 — insufficient role (not MANAGER+)
 *   404 — task or user not found
 *   422 — user is not an Active_Member of the task's project
 *
 * Requirements: 7.1–7.8
 */
exports.bulkAssign = async (req, res, next) => {
  try {
    if (!checkManagerRole(req, res)) return;

    const taskId = Number(req.params.taskId);
    const { user_id } = req.body;

    if (user_id === undefined || user_id === null) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const result = await AssignmentService.bulkAssign(taskId, Number(user_id));
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/groups/:taskId/distribute
 *
 * Distribute child subtasks of the given task across a set of users.
 *
 * Path params: taskId
 * Body:        {
 *                mode:        "round_robin" | "equal" | "manual",
 *                user_ids:    number[],          // required for round_robin / equal
 *                assignments: [{ subtask_id, user_id }, ...]  // required for manual
 *              }
 *
 * Responses:
 *   200 — { task_id, mode, distribution }
 *   400 — missing/invalid required body fields, or unsupported mode
 *   401 — not authenticated
 *   403 — insufficient role (not MANAGER+)
 *   404 — task not found
 *   422 — one or more user IDs are not Active_Members of the task's project
 *
 * Requirements: 8.1–8.10
 */
exports.distribute = async (req, res, next) => {
  try {
    if (!checkManagerRole(req, res)) return;

    const taskId = Number(req.params.taskId);
    const { mode, user_ids, assignments } = req.body;

    if (!mode) {
      return res.status(400).json({ error: "mode is required" });
    }

    if (!user_ids || !Array.isArray(user_ids)) {
      return res.status(400).json({ error: "user_ids is required and must be an array" });
    }

    const result = await AssignmentService.distribute(
      taskId,
      mode,
      user_ids.map(Number),
      assignments || []
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
