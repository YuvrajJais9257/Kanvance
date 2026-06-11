/**
 * distribute.js — Pure distribution logic for auto-distribute API.
 *
 * No I/O, no DB access. Takes plain data, returns a Map<subtask_id, user_id>.
 */

'use strict';

/**
 * Compute a distribution of subtasks to users.
 *
 * @param {Array<{ id: number }>} subtasks         - Ordered list of subtask objects (position ASC).
 * @param {number[]}              userIds          - Ordered list of user IDs to distribute to.
 * @param {'round_robin'|'equal'|'manual'} mode    - Distribution algorithm.
 * @param {Array<{ subtask_id: number, user_id: number }>} [manualAssignments] - Required when mode is 'manual'.
 * @returns {Map<number, number>} Map from subtask_id to user_id.
 */
function computeDistribution(subtasks, userIds, mode, manualAssignments) {
  switch (mode) {
    case 'round_robin':
      return _roundRobin(subtasks, userIds);
    case 'equal':
      return _equal(subtasks, userIds);
    case 'manual':
      return _manual(manualAssignments);
    default:
      throw new Error(`Unknown distribution mode: ${mode}`);
  }
}

/**
 * Round-robin: subtask at index N → userIds[N % userIds.length]
 *
 * @param {Array<{ id: number }>} subtasks
 * @param {number[]} userIds
 * @returns {Map<number, number>}
 */
function _roundRobin(subtasks, userIds) {
  const result = new Map();
  for (let i = 0; i < subtasks.length; i++) {
    result.set(subtasks[i].id, userIds[i % userIds.length]);
  }
  return result;
}

/**
 * Equal distribution: chunk subtasks into groups of floor(total/users).
 * Remainder subtasks (total % users) are allocated to lower-index users (they get one extra).
 *
 * Example: 7 subtasks, 3 users → floor(7/3) = 2, remainder = 1
 *   user[0] gets 3 subtasks (indices 0–2)
 *   user[1] gets 2 subtasks (indices 3–4)
 *   user[2] gets 2 subtasks (indices 5–6)
 *
 * @param {Array<{ id: number }>} subtasks
 * @param {number[]} userIds
 * @returns {Map<number, number>}
 */
function _equal(subtasks, userIds) {
  const result = new Map();
  const total = subtasks.length;
  const numUsers = userIds.length;
  const base = Math.floor(total / numUsers);
  const remainder = total % numUsers;

  // Users at indices 0..(remainder-1) receive base+1 subtasks; rest receive base.
  let subtaskIndex = 0;
  for (let userIndex = 0; userIndex < numUsers; userIndex++) {
    const count = userIndex < remainder ? base + 1 : base;
    for (let j = 0; j < count; j++) {
      result.set(subtasks[subtaskIndex].id, userIds[userIndex]);
      subtaskIndex++;
    }
  }

  return result;
}

/**
 * Manual: use the provided assignments array directly.
 * Each entry { subtask_id, user_id } is added to the map.
 * Later entries overwrite earlier ones for the same subtask_id.
 *
 * @param {Array<{ subtask_id: number, user_id: number }>} assignments
 * @returns {Map<number, number>}
 */
function _manual(assignments) {
  const result = new Map();
  if (!Array.isArray(assignments)) {
    return result;
  }
  for (const { subtask_id, user_id } of assignments) {
    result.set(subtask_id, user_id);
  }
  return result;
}

module.exports = { computeDistribution };
