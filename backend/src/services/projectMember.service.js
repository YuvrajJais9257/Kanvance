"use strict";

/**
 * projectMember.service.js — Business logic for project membership operations.
 *
 * Sits between the controller and the model layers. Handles all validation
 * (project exists, user exists, duplicate-member checks) and delegates
 * persistence to projectMember.model.js.
 *
 * Requirements: 2.1–2.9, 3.1–3.4, 11.2–11.4
 */

const ProjectMemberModel = require("../models/projectMember.model");
const ProjectModel = require("../models/project.model");
const UserModel = require("../models/user.model");
const { validateRole } = require("./effectiveOwner");

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Throw an error with an HTTP status code attached.
 *
 * @param {string} message
 * @param {number} status
 */
function httpError(message, status) {
  throw Object.assign(new Error(message), { status });
}

/**
 * Assert a project exists; throw 404 if not.
 *
 * @param {number|string} projectId
 * @returns {Promise<object>} The project row from the model.
 */
async function requireProject(projectId) {
  const project = await ProjectModel.getById(projectId);
  if (!project) httpError("Project not found", 404);
  return project;
}

/**
 * Assert a user exists (and is not soft-deleted); throw 404 if not.
 *
 * @param {number|string} userId
 * @returns {Promise<object>} The user row from the model.
 */
async function requireUser(userId) {
  const user = await UserModel.getById(userId);
  if (!user) httpError("User not found", 404);
  return user;
}

// ── Exported service methods ─────────────────────────────────────────────────

/**
 * Add a user to a project as a member.
 *
 * Steps:
 *  1. Validate project exists → 404
 *  2. Validate role value → 400
 *  3. Validate user exists → 404
 *  4. Check for duplicate active membership → 409
 *  5. INSERT or re-activate via model
 *
 * @param {number|string} projectId
 * @param {{ user_id: number, role: string }} data
 * @returns {Promise<object>} Created / re-activated membership record.
 *
 * Requirements: 2.1–2.6
 */
exports.addMember = async (projectId, data) => {
  const { user_id, role } = data ?? {};

  // Requirement 2.2 — both fields required
  if (user_id == null || role == null) {
    httpError("user_id and role are required", 400);
  }

  // Requirement 2.3 — validate role value
  const roleError = validateRole(role);
  if (roleError) httpError(roleError, 400);

  // Requirement 2.6 — project must exist
  await requireProject(projectId);

  // Requirement 2.5 — user must exist
  await requireUser(user_id);

  // Requirement 2.4 — no duplicate active membership
  const existing = await ProjectMemberModel.findActive(projectId, user_id);
  if (existing) httpError("User is already an active member of this project", 409);

  // INSERT or re-activate (ON DUPLICATE KEY UPDATE handles re-join)
  return ProjectMemberModel.insert(projectId, user_id, role);
};

/**
 * Remove (soft-leave) a user from a project.
 *
 * Steps:
 *  1. Find active membership row → 404 if absent
 *  2. Soft-leave (set left_date = CURDATE())
 *  3. Return { removed: true }
 *
 * @param {number|string} projectId
 * @param {number|string} userId
 * @returns {Promise<{ removed: true }>}
 *
 * Requirements: 2.7, 2.8
 */
exports.removeMember = async (projectId, userId) => {
  // Requirement 2.8 — must be an active member
  const active = await ProjectMemberModel.findActive(projectId, userId);
  if (!active) httpError("User is not an active member of this project", 404);

  // Requirement 2.7 — soft-leave, do not delete the row
  await ProjectMemberModel.softLeave(projectId, userId);
  return { removed: true };
};

/**
 * List all members (active and former) for a project.
 *
 * Steps:
 *  1. Verify project exists → 404
 *  2. Return ordered member list from model
 *
 * The model already orders: active first (left_date IS NULL) then by joined_date ASC.
 *
 * @param {number|string} projectId
 * @returns {Promise<Array<{ id, user_id, user_name, role, joined_date, left_date }>>}
 *
 * Requirements: 3.1–3.3
 */
exports.listMembers = async (projectId) => {
  // Requirement 3.3 — project must exist
  await requireProject(projectId);

  // Requirements 3.1, 3.2 — return ordered list
  return ProjectMemberModel.listAll(projectId);
};

/**
 * Return the set of users assignable within a project.
 *
 * If the project has at least one active member, returns all active members
 * ordered by user_name ASC. If the project has no members at all, falls back
 * to returning the project owner as the sole entry (backward-compat).
 *
 * Steps:
 *  1. Verify project exists → 404
 *  2. Fetch active members (listActive)
 *  3. If any members exist, return them
 *  4. Otherwise fall back to project owner
 *
 * @param {number|string} projectId
 * @returns {Promise<Array<{ user_id, user_name, role }>>}
 *
 * Requirements: 11.2, 11.3, 11.4
 */
exports.assignableUsers = async (projectId) => {
  // Requirement 11.3 — project must exist
  const project = await requireProject(projectId);

  // Requirement 11.2 — return active members ordered by user_name ASC
  const members = await ProjectMemberModel.listActive(projectId);
  if (members.length > 0) return members;

  // Requirement 11.4 — backward-compat fallback: return project owner if no members
  if (project.owner_id != null) {
    const owner = await UserModel.getById(project.owner_id);
    if (owner) {
      return [{ user_id: owner.id, user_name: owner.name, role: "member" }];
    }
  }

  // No members and no owner — return empty array
  return [];
};

/**
 * Boolean helper: check whether a user is an active member of a project.
 *
 * Returns `true` when an active membership row exists (left_date IS NULL),
 * `false` otherwise. Does NOT throw for missing project/user — callers that
 * need those checks should call addMember/removeMember directly.
 *
 * Used internally by other services (assignment.service, group.service) to
 * enforce the membership gate before writing to task_assignments.
 *
 * As a special backward-compat case: if the project has zero project_members
 * rows at all, this function returns `true` for the project owner so that
 * pre-membership projects are not broken.
 *
 * @param {number|string} projectId
 * @param {number|string} userId
 * @returns {Promise<boolean>}
 *
 * Requirements: 11.1, 11.4
 */
exports.isActiveMember = async (projectId, userId) => {
  // Fast path: check direct active membership first
  const active = await ProjectMemberModel.findActive(projectId, userId);
  if (active) return true;

  // Backward-compat: if the project has no members at all, allow the owner
  const members = await ProjectMemberModel.listActive(projectId);
  if (members.length === 0) {
    // No members exist — allow access only for the project owner
    const project = await ProjectModel.getById(projectId);
    if (project && project.owner_id != null && Number(project.owner_id) === Number(userId)) {
      return true;
    }
  }

  return false;
};
