"use strict";

/**
 * projectMember.controller.js
 *
 * HTTP handlers for project membership endpoints:
 *   POST   /api/projects/:projectId/members            → addMember
 *   DELETE /api/projects/:projectId/members/:userId    → removeMember
 *   GET    /api/projects/:projectId/members            → listMembers
 *   GET    /api/projects/:projectId/assignable-users   → assignableUsers
 *
 * Role enforcement: all four handlers require MANAGER+ (MANAGER, ADMIN, MASTER_ADMIN).
 * The check is performed inline rather than as a route-level middleware so that 403
 * is returned before any service work begins, matching the validation order in the design:
 *   1. Path param validation (done by service → 404)
 *   2. Body validation (done by service → 400)
 *   3. Role check (done here → 403)
 *   4. Membership/business validation (done by service → 409 / 422)
 *
 * Service errors carry a `.status` property set by the service's `httpError` helper.
 * Passing them to `next(err)` delegates to the central error middleware which maps
 * err.status → HTTP status automatically.
 *
 * Requirements: 2.9, 3.4, 11.5
 */

const ProjectMemberService = require("../services/projectMember.service");
const { getEffectiveRole } = require("../middlewares/requireRole");

// Roles allowed to manage project membership.
const ALLOWED_ROLES = ["MANAGER", "ADMIN", "MASTER_ADMIN"];

/**
 * Verify that the caller's effective role is MANAGER or higher.
 * Returns true if allowed; writes a 403 response and returns false if not.
 *
 * MASTER_ADMIN is already handled by requireRole middleware when used as route
 * middleware, but since we enforce the check inline here we need to cover it
 * explicitly. getEffectiveRole already accounts for group privilege level.
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
  if (!ALLOWED_ROLES.includes(effectiveRole)) {
    res.status(403).json({
      error: `Forbidden — requires one of: ${ALLOWED_ROLES.join(", ")}`,
    });
    return false;
  }

  return true;
}

/**
 * POST /api/projects/:projectId/members
 *
 * Add a user to a project as a member.
 *
 * Body: { user_id: number, role: "member" | "lead" | "contributor" }
 *
 * Responses:
 *   201 — created membership record
 *   400 — missing/invalid fields
 *   403 — insufficient role
 *   404 — project or user not found
 *   409 — user is already an active member
 *
 * Requirements: 2.1–2.6, 2.9
 */
exports.addMember = async (req, res, next) => {
  try {
    if (!checkManagerRole(req, res)) return;

    const { projectId } = req.params;
    const record = await ProjectMemberService.addMember(projectId, req.body);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/projects/:projectId/members/:userId
 *
 * Soft-remove a user from a project (sets left_date = CURRENT_DATE).
 *
 * Responses:
 *   200 — { removed: true }
 *   403 — insufficient role
 *   404 — user not an active member of this project
 *
 * Requirements: 2.7, 2.8, 2.9
 */
exports.removeMember = async (req, res, next) => {
  try {
    if (!checkManagerRole(req, res)) return;

    const { projectId, userId } = req.params;
    const result = await ProjectMemberService.removeMember(projectId, userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/projects/:projectId/members
 *
 * List all members (active and former) for a project.
 * Active members appear first (left_date IS NULL), ordered by joined_date ASC,
 * followed by former members also ordered by joined_date ASC.
 *
 * Responses:
 *   200 — array of { id, user_id, user_name, role, joined_date, left_date }
 *   403 — insufficient role
 *   404 — project not found
 *
 * Requirements: 3.1–3.4
 */
exports.listMembers = async (req, res, next) => {
  try {
    if (!checkManagerRole(req, res)) return;

    const { projectId } = req.params;
    const members = await ProjectMemberService.listMembers(projectId);
    res.json(members);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/projects/:projectId/assignable-users
 *
 * Return users eligible for assignment within a project.
 * If the project has at least one active member, returns all active members
 * ordered by user_name ASC. If the project has no members at all, falls back
 * to the project owner as the sole entry (backward-compatibility).
 *
 * Responses:
 *   200 — array of { user_id, user_name, role }
 *   403 — insufficient role
 *   404 — project not found
 *
 * Requirements: 11.2–11.5
 */
exports.assignableUsers = async (req, res, next) => {
  try {
    if (!checkManagerRole(req, res)) return;

    const { projectId } = req.params;
    const users = await ProjectMemberService.assignableUsers(projectId);
    res.json(users);
  } catch (err) {
    next(err);
  }
};
