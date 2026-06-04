# Implementation Plan: Assignment and Project Membership Architecture

## Overview

Implements project membership tracking, task-level assignment inheritance, multi-assignee subtasks, bulk/auto-distribution APIs, effective-owner resolution, and assignment history — all in the existing Node.js/Express + MySQL backend following the Router → Controller → Service → Model pattern.

## Tasks

- [x] 1. Database migration script
  - [x] 1.1 Write migration file `backend/src/migrations/002_assignment_membership_architecture.js`
    - Create `project_members` table with `IF NOT EXISTS` guard, all columns, unique key, and FK constraints per the design schema
    - Add `activity_groups.assignee_id` column with `INFORMATION_SCHEMA` existence check and `ON DELETE SET NULL` FK
    - Add `task_assignments.unassigned_date` column with `INFORMATION_SCHEMA` existence check
    - Add `task_assignments.inherited_from_task_id` column with `INFORMATION_SCHEMA` existence check and `ON DELETE SET NULL` FK
    - Wrap all DDL in a single transaction; rollback and exit non-zero on any failure
    - Log each DDL statement (or skip notice) to stdout before executing
    - _Requirements: 1.1–1.5, 12.1–12.8_

  - [ ]* 1.2 Write property test for migration idempotence (Property 11)
    - **Property 11: Migration Idempotence** — run migration `n` (1–5) times; schema state identical to first run, no unrelated table data modified
    - Use fast-check to generate `n` in range 1–5, run actual migration script against test DB
    - File: `backend/src/__tests__/migration.test.js`
    - **Validates: Requirements 1.4, 12.1–12.5**

  - [ ]* 1.3 Write unit tests for migration smoke and failure rollback
    - Verify all four columns/table exist with correct definitions after migration
    - Inject a DDL error and verify full rollback occurs
    - File: `backend/src/__tests__/migration.test.js`
    - _Requirements: 1.5, 12.6_

- [x] 2. Core data models and SQL helpers

  - [x] 2.1 Create `backend/src/models/projectMember.model.js`
    - `insert(projectId, userId, role)` — INSERT or UPDATE `left_date = NULL` for returning members
    - `softLeave(projectId, userId)` — UPDATE `left_date = CURRENT_DATE`
    - `findActive(projectId, userId)` — SELECT single Active_Member row
    - `listAll(projectId)` — SELECT all members with `user_name`, ordered active-first then by `joined_date ASC`
    - `listActive(projectId)` — SELECT Active_Members with `user_name`, ordered by `user_name ASC` (for assignable-users)
    - `validateMembers(projectId, userIds)` — returns subset of `userIds` that ARE active members
    - _Requirements: 2.1, 2.7, 3.1, 3.2, 11.2_

  - [x] 2.2 Create `backend/src/models/assignment.model.js`
    - `getActiveAssignments(subtaskId)` — SELECT Active_Assignment rows for a subtask
    - `insertAssignment(subtaskId, userId, inheritedFromTaskId)` — INSERT `task_assignments` row
    - `softUnassign(subtaskId, userIds)` — UPDATE `unassigned_date = CURRENT_DATE` for given users on a subtask
    - `softUnassignInherited(taskId)` — UPDATE `unassigned_date = CURRENT_DATE` where `inherited_from_task_id = taskId`
    - `getHistory(subtaskId)` — SELECT all rows with `user_name`, ordered `assigned_date DESC, id DESC`
    - `getSubtaskIdsForTask(taskId)` — SELECT child subtask IDs for a task
    - Include the Effective_Owner SQL fragment as an exported constant string for reuse in other models
    - _Requirements: 4.2, 4.6, 6.2–6.4, 9.1–9.4, 5.1_

  - [ ]* 2.3 Write property test for soft-delete invariant (Property 1)
    - **Property 1: Soft-Delete Invariant** — for any sequence of add/remove/reassign operations, `COUNT(*)` of `task_assignments` and `project_members` never decreases
    - File: `backend/src/__tests__/assignment.service.test.js`
    - **Validates: Requirements 2.7, 9.1, 9.2, 9.3**

- [x] 3. Pure helper functions

  - [x] 3.1 Create `backend/src/services/effectiveOwner.js` (pure module)
    - Export `resolveEffectiveOwner(activeAssignment, taskAssigneeId, projectOwnerId)` — implements the four-case priority chain and returns `{ effectiveOwnerId, effectiveOwnerName, inherited }`
    - Export `sortMembers(members)` — sorts active-first then by `joined_date ASC` (used for member list ordering)
    - Export `validateRole(role)` — returns `null` for valid roles or an error string for invalid ones
    - _Requirements: 3.2, 2.3, 5.1_

  - [x] 3.2 Create `backend/src/services/distribute.js` (pure module)
    - Export `computeDistribution(subtasks, userIds, mode, manualAssignments)` — returns `Map<subtask_id, user_id>`
    - Implement `round_robin`, `equal`, and `manual` modes per the design formulas
    - _Requirements: 8.5, 8.6, 8.7_

  - [ ]* 3.3 Write property test for Effective_Owner priority chain (Property 2 — pure)
    - **Property 2: Effective_Owner Priority Chain** — all four subtask ownership states produce correct `{ effectiveOwnerId, inherited }` tuple
    - File: `backend/src/__tests__/effectiveOwner.pure.test.js`
    - **Validates: Requirements 5.1, 5.2, 5.3, 10.1, 10.2**

  - [ ]* 3.4 Write property test for role validation (Property 10 — pure)
    - **Property 10: Role Validation Rejects All Non-Valid Roles** — any string not in `{member, lead, contributor}` returns a validation error
    - File: `backend/src/__tests__/projectMember.service.test.js`
    - **Validates: Requirement 2.3**

  - [ ]* 3.5 Write property test for round-robin distribution formula (Property 6 — pure)
    - **Property 6: Round-Robin Distribution Formula** — subtask at index `i` maps to `userIds[i % M]` for all i
    - File: `backend/src/__tests__/distribute.pure.test.js`
    - **Validates: Requirement 8.5**

  - [ ]* 3.6 Write property test for equal distribution balance (Property 7 — pure)
    - **Property 7: Equal Distribution Balance** — max minus min count per user ≤ 1; remainder subtasks go to lower-index users
    - File: `backend/src/__tests__/distribute.pure.test.js`
    - **Validates: Requirement 8.6**

  - [ ]* 3.7 Write property test for member list ordering invariant (Property 9 — pure)
    - **Property 9: Member List Ordering Invariant** — active members always precede former members; each group sorted by `joined_date ASC`
    - File: `backend/src/__tests__/projectMember.service.test.js`
    - **Validates: Requirement 3.2**

- [x] 4. Checkpoint — Ensure all pure-function and model tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Project membership service and controller

  - [x] 5.1 Create `backend/src/services/projectMember.service.js`
    - `addMember(projectId, data)` — validate project + user exist, check for duplicate active member (409), INSERT or re-activate row
    - `removeMember(projectId, userId)` — find active row (404 if absent), soft-leave
    - `listMembers(projectId)` — verify project exists, return ordered member list from model
    - `assignableUsers(projectId)` — return active members; fall back to project owner if no members exist
    - `isActiveMember(projectId, userId)` — boolean helper used by other services
    - _Requirements: 2.1–2.9, 3.1–3.4, 11.2–11.4_

  - [x] 5.2 Create `backend/src/controllers/projectMember.controller.js`
    - `addMember`, `removeMember`, `listMembers`, `assignableUsers` handlers
    - Enforce MANAGER+ role check (403 on failure) before delegating to service
    - Map service errors to HTTP responses per the error contract in the design
    - _Requirements: 2.9, 3.4, 11.5_

  - [x] 5.3 Extend `backend/src/routers/project.routes.js`
    - Add `POST /api/projects/:projectId/members` → `projectMember.addMember`
    - Add `DELETE /api/projects/:projectId/members/:userId` → `projectMember.removeMember`
    - Add `GET /api/projects/:projectId/members` → `projectMember.listMembers`
    - Add `GET /api/projects/:projectId/assignable-users` → `projectMember.assignableUsers`
    - All four routes apply `requireAuth` middleware; manager-level check is in the controller
    - _Requirements: 2.1, 2.7, 3.1, 11.2_

  - [ ]* 5.4 Write unit tests for project membership service
    - Test duplicate-add (409), soft-leave, re-join (no second row), 404 on unknown project/user, no-member owner bypass
    - File: `backend/src/__tests__/projectMember.service.test.js`
    - _Requirements: 2.1–2.8, 11.4_

- [x] 6. Assignment service (shared logic)

  - [x] 6.1 Create `backend/src/services/assignment.service.js`
    - `syncAssignees(subtaskId, assigneeIds, projectId)` — validate all IDs are Active_Members, compute diff, soft-unassign removals, INSERT additions, update `subtasks.assignee_id`; run in transaction
    - `propagateTaskAssignment(taskId, assigneeId)` — INSERT inherited `task_assignments` rows for child subtasks without an Active_Assignment for this user; use `ON DUPLICATE KEY` logic; run in transaction with the `activity_groups` update
    - `clearInheritedAssignments(taskId)` — soft-unassign all rows with `inherited_from_task_id = taskId`
    - `bulkAssign(taskId, userId, projectId)` — validate task, user, membership; soft-unassign differing actives; INSERT/preserve target user assignments; update `subtasks.assignee_id` and `activity_groups.assignee_id`; run in transaction
    - `distribute(taskId, mode, userIds, assignments, projectId)` — validate task, mode, users (Active_Members), manual subtask IDs; compute distribution via `computeDistribution`; apply changes in transaction
    - _Requirements: 4.2–4.6, 6.1–6.6, 7.1–7.8, 8.1–8.10_

  - [ ]* 6.2 Write property test for assignee sync idempotence (Property 4)
    - **Property 4: Assignee Sync Idempotence** — applying `syncAssignees` twice with the same array produces the same final state as once; `task_assignments` count only grows
    - File: `backend/src/__tests__/assignment.service.test.js`
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6**

  - [ ]* 6.3 Write property test for bulk-assign post-condition (Property 5)
    - **Property 5: Bulk-Assign Post-Condition** — after a successful bulk-assign all five post-conditions hold (every child has Active_Assignment for target user, `subtasks.assignee_id` updated, `activity_groups.assignee_id` updated, no rows deleted, original `assigned_date` preserved for pre-existing assignments)
    - File: `backend/src/__tests__/assignment.service.test.js`
    - **Validates: Requirements 7.4, 7.5, 7.6, 7.7**

  - [ ]* 6.4 Write property test for membership gate (Property 3)
    - **Property 3: Membership and Role Gate** — any assignment write with invalid role or non-member user_id returns correct HTTP error and makes zero DB writes
    - File: `backend/src/__tests__/assignment.service.test.js`
    - **Validates: Requirements 2.9, 3.4, 4.5, 6.1, 7.3, 7.8, 8.4, 8.10, 9.6, 11.1, 11.5**

- [x] 7. Task-level assignment and group controller extensions

  - [x] 7.1 Extend `backend/src/services/group.service.js`
    - In the existing `update` method, detect `assignee_id` in request data
    - If new value equals current value → no-op return
    - If null → call `assignment.service.clearInheritedAssignments(taskId)`
    - If non-null → validate user exists (404), validate Active_Member (422), UPDATE `activity_groups.assignee_id`, call `assignment.service.propagateTaskAssignment(taskId, assigneeId)`
    - _Requirements: 4.1–4.6_

  - [x] 7.2 Extend `backend/src/controllers/group.controller.js`
    - Add `bulkAssign` handler — validate body (`user_id` required), delegate to `assignment.service.bulkAssign`, enforce MANAGER+ (403)
    - Add `distribute` handler — validate body (`mode`, `user_ids` required), delegate to `assignment.service.distribute`, enforce MANAGER+ (403)
    - Map service errors (404, 422, 400) to HTTP responses
    - _Requirements: 7.1–7.8, 8.1–8.10_

  - [x] 7.3 Extend `backend/src/routers/group.routes.js`
    - Add `POST /api/groups/:taskId/bulk-assign` → `group.bulkAssign` with `requireAuth`
    - Add `POST /api/groups/:taskId/distribute` → `group.distribute` with `requireAuth`
    - Ensure existing `PATCH /api/groups/:taskId` handler is preserved
    - _Requirements: 7.1, 8.1_

- [x] 8. Multi-assignee subtask sync and assignment history

  - [x] 8.1 Extend `backend/src/services/subtask.service.js`
    - In the existing `update` method, detect `assignee_ids` or legacy `assignee_id`
    - Resolve `projectId` from the subtask's group
    - Call `assignment.service.syncAssignees(id, resolvedIds, projectId)`
    - Continue existing audit-log and status-recalc logic unchanged
    - _Requirements: 6.1–6.6_

  - [x] 8.2 Extend `backend/src/controllers/subtask.controller.js`
    - Add `assignmentHistory` handler — verify subtask exists (404), enforce MANAGER+ (403), delegate to `assignment.model.getHistory`
    - Ensure existing `update` handler passes `assignee_ids`/`assignee_id` through to the service
    - _Requirements: 9.4–9.6_

  - [x] 8.3 Extend `backend/src/routers/subtask.routes.js`
    - Add `GET /api/subtasks/:id/assignment-history` → `subtask.assignmentHistory` with `requireAuth`
    - Ensure both `PUT` and `PATCH` verbs on `/api/subtasks/:id` route to the same update handler
    - _Requirements: 9.4_

  - [ ]* 8.4 Write property test for assignment history completeness and ordering (Property 8)
    - **Property 8: Assignment History Completeness and Ordering** — history response length equals total `task_assignments` rows for the subtask; ordered strictly by `assigned_date DESC, id DESC`
    - File: `backend/src/__tests__/assignmentHistory.test.js`
    - **Validates: Requirements 9.3, 9.4**

  - [ ]* 8.5 Write unit tests for subtask multi-assignee sync
    - Test `assignee_ids: []` unassigns all, legacy `assignee_id` single field, backward-compat `subtasks.assignee_id` mirror
    - File: `backend/src/__tests__/assignment.service.test.js`
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 9. Checkpoint — Ensure all service and controller tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Update project query to include effective owner and assignees

  - [x] 10.1 Extend `backend/src/models/project.model.js` (or the equivalent model serving `GET /api/projects/:projectId`)
    - Replace the subtask `SELECT` with the updated query from the design: add `effective_assignee_id`, `effective_assignee_name`, and `inherited` columns using the Effective_Owner SQL fragment
    - Add the secondary query to fetch `assignees[]` (`task_assignments` JOIN `users` for Active_Assignments) and merge results in the service
    - Keep the existing `assignee_id` column in the response for backward compatibility
    - _Requirements: 5.2, 5.3, 6.7_

  - [ ]* 10.2 Write integration tests for effective owner on project response
    - Test all four ownership states (Active_Assignment, task-level only, project-owner only, none) are reflected correctly in the response
    - Verify `inherited` flag values match expected per state
    - File: `backend/src/__tests__/effectiveOwner.pure.test.js`
    - _Requirements: 5.2, 5.3_

- [x] 11. Update analytics and timesheet models to use Effective_Owner

  - [x] 11.1 Extend `backend/src/models/analytics.model.js`
    - Replace the existing `s_agg` subquery's `assignee_id`-based join with the Effective_Owner derived-table pattern from the design
    - Add `project_member_count` subquery to each project row in the team-utilisation response
    - _Requirements: 5.4, 10.1, 10.4_

  - [x] 11.2 Extend `backend/src/models/timesheetEntries.model.js`
    - Replace the `task_assignments` join in the grid query with the three-branch UNION (direct Active_Assignment, task-level inherited, project-level inherited) from the design
    - Ensure multi-assignee subtasks appear once per actively assigned user (the direct branch handles this)
    - _Requirements: 5.5, 10.2, 10.3_

  - [ ]* 11.3 Write integration tests for analytics Effective_Owner attribution
    - Verify a user who is the inherited owner (task-level) appears with correct subtask counts in team-utilisation
    - File: `backend/src/__tests__/analytics.effectiveOwner.test.js`
    - _Requirements: 10.1_

  - [ ]* 11.4 Write integration tests for timesheet grid Effective_Owner expansion
    - Verify task-level inherited owner sees the subtask in their grid row
    - Verify multi-assignee subtask appears for each active assignee
    - File: `backend/src/__tests__/timesheet.effectiveOwner.test.js`
    - _Requirements: 10.2, 10.3_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design uses JavaScript (Node.js/Express + MySQL) throughout; all code follows the existing project conventions
- fast-check must be installed as a dev dependency (`npm install --save-dev fast-check`) before running property tests
- Property tests require a dedicated test MySQL database; integration tests in tasks 10–11 should use the same test DB as the migration test
- Checkpoints in tasks 4, 9, and 12 ensure incremental validation at logical boundaries

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "3.2"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 3, "tasks": ["5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["7.1", "8.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 7, "tasks": ["10.1"] },
    { "id": 8, "tasks": ["10.2", "11.1", "11.2"] },
    { "id": 9, "tasks": ["11.3", "11.4"] }
  ]
}
```
