# Requirements Document

## Introduction

This document covers the requirements for the Assignment and Project Membership Architecture feature in Kanvance — a project management SaaS application (Node.js/Express + MySQL backend).

The feature extends the existing data model and API surface to support:

1. **Project Membership** — A `project_members` table that tracks which users belong to a project, with soft-leave semantics and historical record preservation.
2. **Assignment Inheritance** — Task-level assignment propagates down to child subtasks, with subtask-level overrides taking priority. The effective owner resolution priority is: Subtask Assignment → Task Assignment → Project Membership.
3. **Multi-Assignee Subtasks** — Replace the single `subtask.assignee_id` column with multi-user support backed by the existing `task_assignments` table.
4. **Bulk and Auto-Distribution APIs** — A bulk-assign endpoint and an auto-distribute endpoint that spreads subtasks across a set of users in round-robin or equal-distribution modes.
5. **Effective Owner Resolution** — Analytics and timesheets use the resolved effective owner, not a raw `assignee_id`.

### Existing Tables (must not be broken)

- `projects` (id, customer_id, name, type, owner_id, status, start_date, due_date, notes, estimated_hours)
- `activity_groups` (id, project_id, name, position, estimated_hours) — represents "Tasks"
- `subtasks` (id, group_id, name, status, due_date, assignee_id, estimated_hours, …)
- `task_assignments` (id, user_id, subtask_id, assigned_date, UNIQUE(user_id, subtask_id))
- `users` (id, name, role, email, status, deleted_at, group_id)

### New Tables / Columns Required

- `project_members` (id, project_id, user_id, joined_date, left_date, role) — new table
- `activity_groups.assignee_id` — new nullable FK column for task-level assignment
- `task_assignments.unassigned_date` — new nullable DATE column for soft-unassign history

---

## Glossary

- **Kanvance**: The project management SaaS application being developed.
- **Project**: A top-level work container in the `projects` table.
- **Task**: An `activity_groups` record — a logical grouping of subtasks within a project.
- **Subtask**: A leaf-level work item in the `subtasks` table.
- **Project_Member**: A record in the `project_members` table linking a user to a project with a role, joined date, and optional left date.
- **Active_Member**: A `project_members` row where `left_date IS NULL`.
- **Task_Assignment**: A record in the `task_assignments` table linking a user to a subtask with an assigned date and optional unassigned date.
- **Active_Assignment**: A `task_assignments` row where `unassigned_date IS NULL`.
- **Effective_Owner**: The resolved single owner of a subtask according to the priority chain: Active_Assignment → `activity_groups.assignee_id` → `projects.owner_id`. Used by analytics and timesheets.
- **Effective_Owner_Resolver**: The backend SQL logic that computes the Effective_Owner at query time for any given subtask.
- **Assignment_Inheritance**: The rule by which a task-level `assignee_id` propagates to all child subtasks that do not have an Active_Assignment.
- **Bulk_Assign**: An operation that sets all child subtasks of a given task to a single assignee in one API call.
- **Auto_Distribute**: An operation that distributes child subtasks of a given task across a provided set of users using a specified distribution mode.
- **Distribution_Mode**: The algorithm used by Auto_Distribute. Supported modes: `round_robin`, `equal`, `manual`.
- **Soft_Leave**: Setting `project_members.left_date = CURRENT_DATE` instead of deleting the row, preserving historical membership data.
- **Soft_Unassign**: Setting `task_assignments.unassigned_date = CURRENT_DATE` instead of deleting the row, preserving assignment history.
- **Manager**: A user whose effective role is `MANAGER` or higher.
- **Admin**: A user whose effective role is `ADMIN` or `MASTER_ADMIN`.
- **Migration_Script**: The idempotent Node.js migration file in `backend/src/migrations/` that applies schema changes.

---

## Requirements

---

### Requirement 1: Project Membership — Data Model

**User Story:** As a Manager, I want to track which users are members of a project with join and leave dates, so that I can maintain accurate historical team membership records and support reporting across team changes.

#### Acceptance Criteria

1. THE Migration_Script SHALL create a `project_members` table with columns: `id INT AUTO_INCREMENT PRIMARY KEY`, `project_id INT NOT NULL`, `user_id INT NOT NULL`, `joined_date DATE NOT NULL`, `left_date DATE DEFAULT NULL`, `role VARCHAR(50) NOT NULL DEFAULT 'member'`, a `UNIQUE KEY uq_project_user (project_id, user_id)`, and foreign keys referencing `projects(id) ON DELETE CASCADE` and `users(id) ON DELETE CASCADE`. The `UNIQUE KEY` enforces at most one active membership row per (project_id, user_id) pair; re-joining after a soft-leave is handled at the application layer by setting `left_date = NULL` rather than inserting a second row.
2. THE Migration_Script SHALL add an `assignee_id INT DEFAULT NULL` column to the `activity_groups` table with a foreign key referencing `users(id) ON DELETE SET NULL`; IF the column already exists, THE Migration_Script SHALL skip the `ALTER TABLE` statement without error.
3. THE Migration_Script SHALL add an `unassigned_date DATE DEFAULT NULL` column to the `task_assignments` table; IF the column already exists, THE Migration_Script SHALL skip the `ALTER TABLE` statement without error.
4. THE Migration_Script SHALL be idempotent — each `ALTER TABLE` is guarded by an `INFORMATION_SCHEMA.COLUMNS` existence check and each `CREATE TABLE` uses `IF NOT EXISTS`, so the script is safe to run multiple times without error.
5. IF any DDL statement fails during execution, THEN THE Migration_Script SHALL halt immediately, ROLLBACK the transaction, and print an error message identifying the failed statement. The Migration_Script MAY print skip/informational messages for idempotency checks; it SHALL NOT print a success confirmation for each individual DDL statement that executes normally.

---

### Requirement 2: Project Membership — Add and Remove Members

**User Story:** As a Manager, I want to add and remove users from a project's team, so that I can control who has project visibility, receives notifications, and is eligible for task assignment.

#### Acceptance Criteria

1. WHEN `POST /api/projects/:projectId/members` is received with a `user_id` (integer) and a `role` value that is one of `"member"`, `"lead"`, or `"contributor"`, THE System SHALL insert a record into `project_members` with `joined_date = CURRENT_DATE` and `left_date = NULL` and SHALL return HTTP 201 with the created record containing `id`, `project_id`, `user_id`, `role`, `joined_date`, and `left_date`.
2. IF `POST /api/projects/:projectId/members` is received with a `user_id` or `role` field absent from the request body, THEN THE System SHALL return HTTP 400 indicating that both `user_id` and `role` are required.
3. IF `POST /api/projects/:projectId/members` is received with a `role` value that is not one of `"member"`, `"lead"`, or `"contributor"`, THEN THE System SHALL return HTTP 400 indicating the valid role values.
4. IF `POST /api/projects/:projectId/members` is received with a `user_id` that already has an Active_Member record for that project (i.e., `left_date IS NULL`), THEN THE System SHALL return HTTP 409 indicating the user is already an active member.
5. IF `POST /api/projects/:projectId/members` is received with a `user_id` that does not exist in the `users` table, THEN THE System SHALL return HTTP 404 indicating the user was not found.
6. IF `POST /api/projects/:projectId/members` is received with a `projectId` that does not exist in the `projects` table, THEN THE System SHALL return HTTP 404 indicating the project was not found.
7. WHEN `DELETE /api/projects/:projectId/members/:userId` is received for a user with an Active_Member record for that project, THE System SHALL set `left_date = CURRENT_DATE` on that record and SHALL NOT delete the row, returning HTTP 200 with `{ "removed": true }`.
8. IF `DELETE /api/projects/:projectId/members/:userId` is received for a user who has no Active_Member record for that project, THEN THE System SHALL return HTTP 404 indicating the user is not an active member of this project.
9. THE `POST /api/projects/:projectId/members` and `DELETE /api/projects/:projectId/members/:userId` endpoints SHALL verify the caller's effective role is `ADMIN`, `MASTER_ADMIN`, or `MANAGER` and SHALL return HTTP 403 for any other effective role.

---

### Requirement 3: Project Membership — List Members

**User Story:** As a Manager, I want to list the current and historical members of a project, so that I can see who is on the team and review past team composition for reporting.

#### Acceptance Criteria

1. WHEN `GET /api/projects/:projectId/members` is received for an existing project, THE System SHALL return HTTP 200 with an array of all `project_members` records for that project, each containing: `id`, `user_id`, `user_name` (from `users.name`, or `null` if the user record no longer exists), `role`, `joined_date`, `left_date` (`null` if still active).
2. THE System SHALL order the response array with Active_Members (where `left_date IS NULL`) first, ordered by `joined_date ASC`, followed by former members (where `left_date IS NOT NULL`), also ordered by `joined_date ASC`.
3. IF `GET /api/projects/:projectId/members` is received with a `projectId` that does not exist in the `projects` table, THEN THE System SHALL return HTTP 404 indicating the project was not found.
4. THE `GET /api/projects/:projectId/members` endpoint SHALL verify the caller's effective role is `ADMIN`, `MASTER_ADMIN`, or `MANAGER` and SHALL return HTTP 403 for any other effective role.

---

### Requirement 4: Task-Level Assignment

**User Story:** As a Manager, I want to assign a Task to a user so that all of the Task's child subtasks automatically inherit that owner, reducing the need to assign each subtask individually.

#### Acceptance Criteria

1. WHEN `PATCH /api/groups/:taskId` is received with an `assignee_id` field, THE System SHALL update `activity_groups.assignee_id` to the provided value and return HTTP 200. WHEN `assignee_id` is identical to the current `activity_groups.assignee_id`, THE System SHALL return HTTP 200 without re-running inheritance propagation.
2. WHEN `activity_groups.assignee_id` is set to a non-null user ID and the propagation is not a no-op, THE System SHALL insert `task_assignments` records (with `assigned_date = CURRENT_DATE`, `unassigned_date = NULL`) for each child subtask of that task that has no Active_Assignment for that `(user_id, subtask_id)` pair. THE System SHALL mark each such inherited record with a source indicator (e.g., `inherited_from_task_id`) so that Criterion 6 can identify and soft-unassign only those records.
3. THE System SHALL NOT modify existing Active_Assignments on child subtasks when propagating a task-level assignment; subtask-level assignments take priority and remain unchanged.
4. IF `PATCH /api/groups/:taskId` is received with an `assignee_id` that does not exist in the `users` table, THEN THE System SHALL return HTTP 404 indicating the user was not found and SHALL NOT create any `task_assignments` records.
5. IF `PATCH /api/groups/:taskId` is received with an `assignee_id` representing a user who is not an Active_Member (`left_date IS NULL` in `project_members`) of the parent project, THEN THE System SHALL return HTTP 422 indicating the user must first be added as a project member.
6. WHEN `PATCH /api/groups/:taskId` is received with `assignee_id: null`, THE System SHALL set `unassigned_date = CURRENT_DATE` on all `task_assignments` records whose `inherited_from_task_id` equals `:taskId` and whose `unassigned_date IS NULL`; records created by direct subtask assignment SHALL NOT be affected.

---

### Requirement 5: Effective Owner Resolution

**User Story:** As a System, I want to resolve the effective owner of any subtask using the priority chain Subtask Assignment → Task Assignment → Project Membership, so that analytics, timesheets, and reporting always display accurate ownership.

#### Acceptance Criteria

1. THE Effective_Owner_Resolver SHALL determine the effective owner of a subtask at query time using this priority chain: (1) the user from the Active_Assignment (`unassigned_date IS NULL`) with the latest `assigned_date DESC` for that `subtask_id`; (2) if no Active_Assignment exists, the user from `activity_groups.assignee_id` for the parent task; (3) if `activity_groups.assignee_id` is also NULL, the `projects.owner_id`; returning `NULL` if all three are absent.
2. WHEN `GET /api/projects/:projectId` is processed, THE System SHALL include `effective_assignee_id` (integer or null) and `effective_assignee_name` (string from `users.name`, or null) on each subtask object in the response, alongside the existing `assignee_id` field.
3. WHEN `GET /api/projects/:projectId` is processed, THE System SHALL include an `inherited` boolean on each subtask object: `false` when the effective owner is resolved from an Active_Assignment on the subtask itself; `true` when resolved from the task-level `assignee_id` or project owner; `null` when no effective owner exists.
4. THE Analytics_Dashboard SHALL use `effective_assignee_id` (not `subtasks.assignee_id`) when computing per-user completed subtask counts and effort aggregations in `GET /api/analytics/team-utilisation`.
5. WHEN `GET /api/timesheet-entries/grid` is processed for a given user, THE System SHALL include in the pre-populated time-log entries all subtasks for which that user is the Effective_Owner, including subtasks where ownership is inherited from task-level or project-level assignment.

---

### Requirement 6: Multi-Assignee Subtasks

**User Story:** As a Manager, I want to assign multiple users to a subtask at once, so that collaborative work items reflect all contributors rather than a single owner.

#### Acceptance Criteria

1. WHEN `PATCH /api/subtasks/:id` is received with an `assignee_ids` array, THE System SHALL first validate that every user ID in the array is an Active_Member of the parent project; IF any user ID is not an Active_Member, THE System SHALL return HTTP 422 identifying all invalid user IDs without modifying any `task_assignments` records.
2. WHEN all user IDs in `assignee_ids` are valid Active_Members, THE System SHALL sync `task_assignments` for that subtask: inserting new Active_Assignments (with `assigned_date = CURRENT_DATE`) for user IDs not already actively assigned, and setting `unassigned_date = CURRENT_DATE` on Active_Assignments for user IDs absent from the array.
3. THE System SHALL preserve the original `assigned_date` for any user ID in `assignee_ids` that already has an Active_Assignment for that subtask.
4. WHEN `PATCH /api/subtasks/:id` is received with `assignee_ids: []`, THE System SHALL set `unassigned_date = CURRENT_DATE` on all Active_Assignments for that subtask, effectively unassigning all users.
5. THE `PATCH /api/subtasks/:id` endpoint SHALL accept the legacy `assignee_id` (single integer or null) field for backward compatibility; WHEN `assignee_id` is present and `assignee_ids` is absent, THE System SHALL treat it as equivalent to `assignee_ids: [assignee_id]`; WHEN `assignee_id` is `null` and `assignee_ids` is absent, THE System SHALL treat it as `assignee_ids: []`.
6. THE System SHALL update `subtasks.assignee_id` to the first element of the `assignee_ids` array after sync (or `NULL` if the array is empty), preserving backward compatibility with code that reads `subtasks.assignee_id` directly.
7. THE `GET /api/projects/:projectId` response SHALL include an `assignees` array on each subtask containing `{ user_id, user_name }` objects for all users with an Active_Assignment for that subtask; the array SHALL be empty when no Active_Assignments exist.

---

### Requirement 7: Bulk Assignment

**User Story:** As a Manager, I want to assign all subtasks of a task to a single user in one API call, so that I can onboard a team member to a task without making individual PATCH calls for each subtask.

#### Acceptance Criteria

1. IF `POST /api/groups/:taskId/bulk-assign` is received with a `taskId` that does not exist in `activity_groups`, THEN THE System SHALL return HTTP 404 indicating the task was not found.
2. IF `POST /api/groups/:taskId/bulk-assign` is received with a `user_id` that does not exist in the `users` table, THEN THE System SHALL return HTTP 404 indicating the user was not found.
3. IF `POST /api/groups/:taskId/bulk-assign` is received with a `user_id` that is not an Active_Member of the parent project, THEN THE System SHALL return HTTP 422 indicating the user must first be added as a project member.
4. WHEN `POST /api/groups/:taskId/bulk-assign` passes all validations, THE System SHALL set `unassigned_date = CURRENT_DATE` on all Active_Assignments for each child subtask where the assigned user differs from the provided `user_id`, then insert new Active_Assignments (`assigned_date = CURRENT_DATE`) for the provided `user_id` on child subtasks that have no Active_Assignment for that user, preserving existing `assigned_date` values for subtasks already assigned to that user.
5. THE System SHALL update `subtasks.assignee_id` for all child subtasks to the provided `user_id` to maintain backward compatibility.
6. THE System SHALL update `activity_groups.assignee_id` to the provided `user_id` for the target task.
7. THE `POST /api/groups/:taskId/bulk-assign` endpoint SHALL return HTTP 200 with `{ task_id, user_id, subtasks_assigned }` where `subtasks_assigned` is the count of child subtasks that received a new or updated assignment.
8. THE `POST /api/groups/:taskId/bulk-assign` endpoint SHALL verify the caller's effective role is `ADMIN`, `MASTER_ADMIN`, or `MANAGER` and SHALL return HTTP 403 for any other effective role.

---

### Requirement 8: Auto-Distribution

**User Story:** As a Manager, I want to automatically distribute a task's subtasks across a set of users, so that workload is spread evenly without manually assigning each subtask.

#### Acceptance Criteria

1. IF `POST /api/groups/:taskId/distribute` is received with a `taskId` that does not exist in `activity_groups`, THEN THE System SHALL return HTTP 404 indicating the task was not found.
2. IF `POST /api/groups/:taskId/distribute` is received with an empty `user_ids` array (or an empty `assignments` array when `mode` is `manual`), THEN THE System SHALL return HTTP 400 indicating at least one user must be specified.
3. IF `POST /api/groups/:taskId/distribute` is received with a `mode` value that is not one of `round_robin`, `equal`, or `manual`, THEN THE System SHALL return HTTP 400 indicating the valid mode values.
4. IF `POST /api/groups/:taskId/distribute` is received with any user ID in `user_ids` that is not an Active_Member of the parent project, THEN THE System SHALL return HTTP 422 identifying all invalid user IDs before performing any assignments.
5. WHEN `mode` is `round_robin`, THE System SHALL assign subtasks (ordered by `subtasks.position ASC`) to users in a repeating cycle: subtask at index N is assigned to `user_ids[N % user_ids.length]`.
6. WHEN `mode` is `equal`, THE System SHALL assign subtasks such that the count difference between any two users is at most 1; remainder subtasks (when `subtask_count % user_count != 0`) SHALL be allocated to users at lower indices in the `user_ids` array.
7. WHEN `mode` is `manual`, THE System SHALL accept an `assignments` array of `{ subtask_id, user_id }` objects; IF any `subtask_id` does not belong to the specified `taskId`, THE System SHALL return HTTP 422 identifying the invalid subtask IDs before performing any assignments.
8. WHEN all validations pass, THE System SHALL set `unassigned_date = CURRENT_DATE` on Active_Assignments for subtasks being reassigned to a different user, then insert new Active_Assignments for the computed distribution, preserving original `assigned_date` for any `(user_id, subtask_id)` pair already active.
9. THE `POST /api/groups/:taskId/distribute` endpoint SHALL return HTTP 200 with `{ task_id, mode, distribution: [{ user_id, subtasks_assigned }] }` when the operation succeeds.
10. THE `POST /api/groups/:taskId/distribute` endpoint SHALL verify the caller's effective role is `ADMIN`, `MASTER_ADMIN`, or `MANAGER` and SHALL return HTTP 403 for any other effective role.

---

### Requirement 9: Assignment History and Soft-Unassign

**User Story:** As a Manager, I want all assignment changes to be preserved historically so that I can trace who was responsible for a subtask at any point in time, even after reassignment.

#### Acceptance Criteria

1. THE System SHALL NOT delete any `task_assignments` row as a result of reassignment or unassignment operations; WHEN a subtask is unassigned, THE System SHALL set `unassigned_date = CURRENT_DATE` on the affected Active_Assignment row.
2. WHEN a new user is assigned to a subtask that already has one or more Active_Assignments for different users, THE System SHALL set `unassigned_date = CURRENT_DATE` on those Active_Assignments before inserting the new assignment record.
3. WHEN the same user is re-assigned to a subtask after a previous unassignment, THE System SHALL insert a new `task_assignments` row with a fresh `assigned_date = CURRENT_DATE`; THE System SHALL NOT update `unassigned_date` on the prior historical row.
4. WHEN `GET /api/subtasks/:id/assignment-history` is received for a subtask that exists, THE System SHALL return HTTP 200 with an array of all `task_assignments` records for that subtask, each containing `id`, `user_id`, `user_name` (from `users.name`, or `null` if the user no longer exists), `assigned_date`, `unassigned_date` (null if still active), ordered by `assigned_date DESC, id DESC`.
5. IF `GET /api/subtasks/:id/assignment-history` is received for a subtask that does not exist, THEN THE System SHALL return HTTP 404 indicating the subtask was not found.
6. THE `GET /api/subtasks/:id/assignment-history` endpoint SHALL verify the caller's effective role is `ADMIN`, `MASTER_ADMIN`, or `MANAGER` and SHALL return HTTP 403 for any other effective role.

---

### Requirement 10: Analytics and Timesheet Integration — Effective Owner

**User Story:** As an Admin, I want analytics and timesheet reports to reflect the effective owner of each subtask, so that productivity metrics and hour logging are accurately attributed even when ownership is inherited.

#### Acceptance Criteria

1. WHEN `GET /api/analytics/team-utilisation` is processed, THE System SHALL attribute each subtask's completed status and logged hours to the Effective_Owner (computed by the priority chain: Active_Assignment → `activity_groups.assignee_id` → `projects.owner_id`) rather than to `subtasks.assignee_id`.
2. WHEN `GET /api/timesheet-entries/grid` is processed for a given user, THE System SHALL include in the pre-populated time-log entries all subtasks for which that user is the Effective_Owner, even when the user has no direct Active_Assignment for the subtask and ownership is inherited from the task or project level.
3. WHILE a subtask has multiple Active_Assignments (multi-assignee), THE System SHALL include that subtask row once for each actively assigned user in the `GET /api/timesheet-entries/grid` response.
4. THE `GET /api/analytics/team-utilisation` response SHALL include a `project_member_count` field per project row, representing the count of records in `project_members` where `project_id` matches and `left_date IS NULL`.
5. THE Effective_Owner_Resolver SHALL compute ownership at query time using live database state and SHALL NOT cache or persist a resolved owner value.

---

### Requirement 11: Project Membership Visibility and Eligibility

**User Story:** As a Manager, I want project membership to control who can be assigned tasks and subtasks within a project, so that assignments are limited to team members already onboarded to the project.

#### Acceptance Criteria

1. IF any assignment request (PATCH subtask `assignee_ids`, PATCH task `assignee_id`, bulk-assign, or distribute) contains a user ID that is not an Active_Member of the parent project, THEN THE System SHALL return HTTP 422 before performing any write operations, with an error body identifying all non-member user IDs.
2. WHEN `GET /api/projects/:projectId/assignable-users` is received for an existing project that has at least one `project_members` record, THE System SHALL return HTTP 200 with an array of all Active_Members, each containing `user_id`, `user_name`, and `role`, ordered by `user_name ASC`.
3. IF `GET /api/projects/:projectId/assignable-users` is received with a `projectId` that does not exist, THEN THE System SHALL return HTTP 404 indicating the project was not found.
4. WHERE a project has no `project_members` records at all, THE System SHALL return the project's `owner` (from `users` where `id = projects.owner_id`) as the sole entry in the `GET /api/projects/:projectId/assignable-users` response, and SHALL bypass the non-member rejection in Criterion 1 for any assignment targeting that owner, preserving backward compatibility.
5. THE `GET /api/projects/:projectId/assignable-users` endpoint SHALL verify the caller's effective role is `ADMIN`, `MASTER_ADMIN`, or `MANAGER` and SHALL return HTTP 403 for any other effective role.

---

### Requirement 12: Database Schema Migration

**User Story:** As a Developer, I want an idempotent migration script that applies all schema changes for this feature, so that the schema can be updated safely in any environment without manual intervention.

#### Acceptance Criteria

1. THE Migration_Script SHALL create the `project_members` table with columns `id INT AUTO_INCREMENT PRIMARY KEY`, `project_id INT NOT NULL`, `user_id INT NOT NULL`, `joined_date DATE NOT NULL`, `left_date DATE DEFAULT NULL`, `role VARCHAR(50) NOT NULL DEFAULT 'member'`, `UNIQUE KEY uq_project_user (project_id, user_id)`, `CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`, and `CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`, using `CREATE TABLE IF NOT EXISTS`.
2. WHEN the `INFORMATION_SCHEMA.COLUMNS` check shows `assignee_id` does not exist on `activity_groups`, THE Migration_Script SHALL execute `ALTER TABLE activity_groups ADD COLUMN assignee_id INT DEFAULT NULL, ADD CONSTRAINT fk_ag_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL`.
3. IF `assignee_id` already exists on `activity_groups`, THEN THE Migration_Script SHALL log a skip message and proceed without error.
4. WHEN the `INFORMATION_SCHEMA.COLUMNS` check shows `unassigned_date` does not exist on `task_assignments`, THE Migration_Script SHALL execute `ALTER TABLE task_assignments ADD COLUMN unassigned_date DATE DEFAULT NULL`.
5. IF `unassigned_date` already exists on `task_assignments`, THEN THE Migration_Script SHALL log a skip message and proceed without error.
6. THE Migration_Script SHALL execute all DDL within a single database transaction; IF any statement fails, THE Migration_Script SHALL ROLLBACK all changes and exit with a non-zero code.
7. THE Migration_Script SHALL NOT execute any `DROP COLUMN`, `RENAME COLUMN`, or column type-change statement on `projects`, `activity_groups`, `subtasks`, `task_assignments`, or `users`.
8. THE Migration_Script SHALL log each DDL statement (or skip notice) to stdout before executing or skipping it.
