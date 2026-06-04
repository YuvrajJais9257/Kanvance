"use strict";

/**
 * subtask.controller.js
 *
 * HTTP handlers for subtask endpoints:
 *   POST   /api/groups/:gid/subtasks        → create
 *   PUT    /api/subtasks/:id                → update
 *   PATCH  /api/subtasks/:id                → update (alias)
 *   DELETE /api/subtasks/:id                → remove
 *   GET    /api/subtasks/:id/assignment-history → assignmentHistory
 *
 * Requirements: 6.1–6.6, 9.4–9.6
 */

const SubtaskService  = require("../services/subtask.service");
const SubtaskModel    = require("../models/subtask.model");
const AssignmentModel = require("../models/assignment.model");
const { getEffectiveRole } = require("../middlewares/requireRole");

// Roles that can assign/reassign subtasks to any user
const ASSIGNERS = ["ADMIN", "LEAD", "MANAGER"];

// Roles allowed to access assignment history (MANAGER+)
const MANAGER_ROLES = ["MANAGER", "ADMIN", "MASTER_ADMIN"];

/**
 * Verify that the caller's effective role is MANAGER or higher.
 * Returns true if allowed; writes a 403 response and returns false if not.
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
    const result = await SubtaskService.create(req.params.gid, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const role = req.session.userRole ?? "MEMBER";
    const body = { ...req.body };

    // MEMBER cannot change assignment fields — strip them from the payload
    if (!ASSIGNERS.includes(role)) {
      if ("assignee_id" in body)  delete body.assignee_id;
      if ("assignee_ids" in body) delete body.assignee_ids;
    }

    await SubtaskService.update(req.params.id, body);
    res.json({ updated: true });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await SubtaskService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

/**
 * GET /api/subtasks/:id/assignment-history
 *
 * Returns the full assignment history for a subtask.
 *
 * Responses:
 *   200 — array of { id, user_id, user_name, assigned_date, unassigned_date, inherited_from_task_id }
 *   401 — not authenticated
 *   403 — insufficient role (requires MANAGER+)
 *   404 — subtask not found
 *
 * Requirements: 9.4–9.6
 */
exports.assignmentHistory = async (req, res, next) => {
  try {
    // Enforce MANAGER+ role (Requirement 9.6)
    if (!checkManagerRole(req, res)) return;

    const { id } = req.params;

    // Verify subtask exists (Requirement 9.5)
    const subtask = await SubtaskModel.getById(id);
    if (!subtask) {
      return res.status(404).json({ error: "Subtask not found" });
    }

    // Delegate to assignment model (Requirement 9.4)
    const history = await AssignmentModel.getHistory(id);
    res.json(history);
  } catch (err) { next(err); }
};
