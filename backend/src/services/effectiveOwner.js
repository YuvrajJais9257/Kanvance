/**
 * effectiveOwner.js — Pure helper functions for effective-owner resolution,
 * member list ordering, and project-member role validation.
 *
 * This module is intentionally free of I/O, DB access, or side effects so it
 * can be unit- and property-tested without any infrastructure.
 */

"use strict";

/**
 * Valid project-member roles.
 * Requirements 2.3, 2.1
 */
const VALID_ROLES = ["member", "lead", "contributor"];

/**
 * Resolves the effective owner of a subtask using the four-case priority chain.
 *
 * Priority order (highest to lowest):
 *   1. Active_Assignment  — an assignment object with `{ userId, userName }` if present
 *   2. Task assignee      — taskAssigneeId / taskAssigneeName (activity_groups.assignee_id)
 *   3. Project owner      — projectOwnerId / projectOwnerName (projects.owner_id)
 *   4. No owner           — all three are absent → effectiveOwnerId = null
 *
 * The `inherited` flag:
 *   - false  when ownership comes from an Active_Assignment on the subtask itself (case 1)
 *   - true   when ownership is inherited from the task or project level (cases 2 & 3)
 *   - null   when no effective owner exists (case 4)
 *
 * @param {{ userId: number, userName: string } | null | undefined} activeAssignment
 *   The latest Active_Assignment for the subtask, or null/undefined if none exists.
 *   Shape expected: `{ userId: number, userName: string }`.
 *
 * @param {number | null | undefined} taskAssigneeId
 *   The `activity_groups.assignee_id` for the subtask's parent task.
 *
 * @param {number | null | undefined} projectOwnerId
 *   The `projects.owner_id` for the subtask's parent project.
 *
 * @param {string | null | undefined} [taskAssigneeName]
 *   The name of the task-level assignee (used when activeAssignment is absent).
 *
 * @param {string | null | undefined} [projectOwnerName]
 *   The name of the project owner (used as ultimate fallback).
 *
 * @returns {{ effectiveOwnerId: number | null, effectiveOwnerName: string | null, inherited: boolean | null }}
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1, 10.2
 */
function resolveEffectiveOwner(
  activeAssignment,
  taskAssigneeId,
  projectOwnerId,
  taskAssigneeName,
  projectOwnerName
) {
  // Case 1 — Active_Assignment exists on the subtask
  if (activeAssignment && activeAssignment.userId != null) {
    return {
      effectiveOwnerId: activeAssignment.userId,
      effectiveOwnerName: activeAssignment.userName ?? null,
      inherited: false,
    };
  }

  // Case 2 — Task-level assignee (activity_groups.assignee_id)
  if (taskAssigneeId != null) {
    return {
      effectiveOwnerId: taskAssigneeId,
      effectiveOwnerName: taskAssigneeName ?? null,
      inherited: true,
    };
  }

  // Case 3 — Project owner fallback (projects.owner_id)
  if (projectOwnerId != null) {
    return {
      effectiveOwnerId: projectOwnerId,
      effectiveOwnerName: projectOwnerName ?? null,
      inherited: true,
    };
  }

  // Case 4 — No effective owner
  return {
    effectiveOwnerId: null,
    effectiveOwnerName: null,
    inherited: null,
  };
}

/**
 * Sorts a mixed array of active and former project members.
 *
 * Sort order:
 *   1. Active members (left_date IS NULL / falsy) before former members
 *   2. Within each group, ascending by `joined_date`
 *
 * The original array is NOT mutated — a new sorted array is returned.
 *
 * @param {Array<{ joined_date: string | Date, left_date: string | Date | null }>} members
 * @returns {Array} Sorted copy of the input array.
 *
 * Requirements: 3.2
 */
function sortMembers(members) {
  if (!Array.isArray(members)) return [];

  return [...members].sort((a, b) => {
    const aActive = !a.left_date ? 1 : 0; // active = 1, former = 0
    const bActive = !b.left_date ? 1 : 0;

    // Active members come first
    if (bActive !== aActive) return bActive - aActive;

    // Within the same group, sort by joined_date ASC
    const aDate = new Date(a.joined_date).getTime();
    const bDate = new Date(b.joined_date).getTime();
    return aDate - bDate;
  });
}

/**
 * Validates a project-member role value.
 *
 * @param {*} role  The role value to validate.
 * @returns {null}          when the role is valid (no error)
 * @returns {string}        an error message when the role is invalid
 *
 * Requirements: 2.3
 */
function validateRole(role) {
  if (VALID_ROLES.includes(role)) return null;
  return `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}.`;
}

module.exports = { resolveEffectiveOwner, sortMembers, validateRole, VALID_ROLES };
