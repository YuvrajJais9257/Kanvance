# Requirements Document

## Introduction

This document covers the requirements for the Analytics Dashboard Refactor, Timesheet Module Overhaul, and Reporting System Enhancement for Kanvance — a project management SaaS application. The work involves three tightly related areas:

1. **Analytics Dashboard (Admin-only)**: Replace table-heavy layout with a modern KPI card + chart design aligned to the Kanvance design system (matching patterns from Jira/Linear/ClickUp).
2. **Timesheet Module (Employee view)**: Replace the current Excel-upload-only workflow with an interactive spreadsheet-style grid where employees view assigned work and log hours directly in the browser.
3. **Hour Logging & Reporting**: Introduce a strict single source of truth for effort tracking — hours logged only at the Subtask level, `hours_logged` and `billable_hours` stored separately, and planning estimates never conflated with actual effort.

### Current State Summary

- **Analytics**: Functional but visually inconsistent. Reads from `activity_logs` (for hours) and `time_logs` (for team utilisation). KPIs presented as dense tables. No visual hierarchy or status semantics on colours.
- **Timesheet**: Entirely file-based (Excel upload → parse → enrich → commit to `time_logs` or `activity_logs`). No in-browser hour entry. The `timesheet_rows` table stores enriched upload snapshots; `time_logs` stores the canonical hours. Effort is tracked by string-matched `project_name + activity_group + subtask_name`, not by foreign-key references.
- **Data model**: Projects → `activity_groups` (Tasks) → `subtasks`. No `task_assignments` table. No `billable_hours` column. No `estimated_hours` column on any entity. No `assigned_date` tracking.

### Target State Summary

- **Analytics**: KPI cards + avatar-based user performance rows + project contribution cards + horizontal bar charts. Admin-only. Design tokens enforced: primary `#2563EB`, success `#22C55E`, warning `#F59E0B`, danger `#EF4444`.
- **Timesheet**: In-browser spreadsheet grid (rows = Project → Task → Subtask, columns = dates). Users log hours at the Subtask level. Pre-filled from assignments. Editable inline.
- **Data model**: New `timesheet_entries` table as single source of truth. New `task_assignments` table for assignment tracking. `estimated_hours` on projects, tasks, and subtasks. `billable_hours` separate from `hours_logged`. All foreign keys FK-based (no string matching).

---

## Glossary

- **Kanvance**: The project management SaaS application being developed.
- **Analytics_Dashboard**: The admin-only page at `/analytics` that renders KPI cards, user performance rows, project contribution cards, and charts.
- **Timesheet_Grid**: The employee-facing in-browser spreadsheet component. Rows represent Project → Task → Subtask hierarchy; columns represent calendar dates.
- **Timesheet_Entry**: A single record in the `timesheet_entries` table — one user, one subtask, one date, with `hours_logged` and `billable_hours`.
- **Task_Assignment**: A record in the `task_assignments` table linking a user to a subtask on a specific `assigned_date`.
- **Effort_Aggregator**: The backend service responsible for rolling up subtask-level hours into task-level and project-level totals.
- **Variance**: `actual_hours - estimated_hours` for a given scope (subtask, task, or project). Positive = over estimate; negative = under estimate.
- **Start_Delay**: `first_work_date - assigned_date` in days, per user per subtask.
- **Design_System**: The Kanvance colour and component system. Primary: `#2563EB`; Success: `#22C55E`; Warning: `#F59E0B`; Danger: `#EF4444`.
- **Admin**: A user with `privilege_level` of `ADMIN` or `MASTER_ADMIN`.
- **Employee**: Any user with `privilege_level` of `MEMBER` or `MANAGER`.
- **KPI_Card**: A summary card UI component displaying a single metric with label, value, and optional trend/icon.
- **Activity_Group**: The current database entity for "Tasks" within a project (`activity_groups` table). Renamed conceptually to "Task" in all UI; the table name is preserved.
- **Subtask**: A leaf-level work item within an `activity_group`. This is where hours are logged.
- **Daily_Limit**: The configurable maximum hours per user per day (default: 8 hrs), used for soft/hard warning logic.
- **Billable_Hours**: Hours tracked separately per `Timesheet_Entry` that count toward client billing.

---

## Requirements

---

### Requirement 1: Analytics Dashboard — KPI Cards

**User Story:** As an Admin, I want to see high-level project and effort metrics in summary cards at the top of the Analytics Dashboard, so that I can get a quick health snapshot without reading dense tables.

#### Acceptance Criteria

1. THE Analytics_Dashboard SHALL display four KPI_Cards in a horizontal row at the top of the page: Total Projects, Active Projects (projects with status "On Track", "At Risk", or "Delayed"), Tasks Completed (mapped to `done_subtasks` from the summary API response), and Effort Logged (mapped to `total_hours_logged` from the summary API response, displayed rounded to one decimal place followed by "hrs").
2. WHEN the Analytics_Dashboard loads, THE Analytics_Dashboard SHALL fetch KPI values from `GET /api/analytics/summary` and SHALL display a loading skeleton in each KPI_Card while the request is in flight.
3. THE Analytics_Dashboard SHALL use the Design_System colour tokens for all KPI_Card status indicators: primary `#2563EB` for neutral counts, success `#22C55E` for completed states, warning `#F59E0B` for at-risk counts, and danger `#EF4444` for overdue or blocked counts.
4. THE KPI_Card components SHALL NOT use table elements (`<table>`, `<tr>`, `<td>`) to display their values.
5. IF the `GET /api/analytics/summary` request fails or times out after 10 seconds, THEN THE Analytics_Dashboard SHALL display an inline error message within the KPI_Card row reading "Unable to load summary data. Please refresh." and SHALL NOT display stale or partial values.
6. THE `GET /api/analytics/summary` endpoint SHALL verify the caller's effective role (via `getEffectiveRole`) is `ADMIN` or `MASTER_ADMIN` and SHALL return HTTP 403 for any other effective role.
7. IF the Analytics_Dashboard page is accessed by a user whose effective role is not `ADMIN` or `MASTER_ADMIN`, THEN the frontend SHALL redirect the user to `/dashboard` and SHALL NOT render any KPI_Card components or issue any analytics API requests.

---

### Requirement 2: Analytics Dashboard — User Performance Section

**User Story:** As an Admin, I want to see each team member's performance in a visual card or row format with avatar, tasks completed, and effort logged, so that I can assess individual contributions without reading a dense table.

#### Acceptance Criteria

1. THE Analytics_Dashboard SHALL display one row per active user in the User Performance section, sourced from `GET /api/analytics/team-utilisation`, showing: user avatar (initials-based fallback using first and last name initials), full name, completed subtasks count (`completed_subtasks`), a progress bar representing `completed_subtasks / assigned_subtasks` (displayed as 0% when `assigned_subtasks = 0`), assigned projects count (`projects_count`), and effort logged in hours (`total_hours` rounded to one decimal place).
2. IF a user has `completed_subtasks = 0` AND `total_hours = 0`, THEN THE Analytics_Dashboard SHALL display that user's row with opacity ≤ 50%, with the task count showing "No activity yet" and effort showing "--".
3. THE Analytics_Dashboard SHALL source User Performance data from `GET /api/analytics/team-utilisation`.
4. THE User Performance section SHALL NOT use a `<table>` element as its primary layout structure.
5. THE Analytics_Dashboard SHALL render a horizontal bar chart titled "Tasks by User" where each bar represents one user's `completed_subtasks` count sourced from `GET /api/analytics/team-utilisation`.
6. THE Analytics_Dashboard SHALL render a horizontal bar chart titled "Effort by Project" where each bar represents one project's total `hours_logged` sourced from `GET /api/analytics/hours-per-person` aggregated by project.
7. THE Analytics_Dashboard SHALL render a pie or donut chart titled "Contribution Distribution" where each segment represents one user's share of total `total_hours` across all users; WHEN all users have `total_hours = 0`, THE Analytics_Dashboard SHALL display the chart in an empty state with the label "No effort logged yet."

---

### Requirement 3: Analytics Dashboard — Project Contribution Section

**User Story:** As an Admin, I want to see each project's contribution as a card with contributors, task completion, effort logged, and status badge, so that I can assess project health at a glance.

#### Acceptance Criteria

1. WHEN the Analytics_Dashboard loads the Project Contribution section, THE Analytics_Dashboard SHALL display one card per project showing: project name, number of distinct contributors (distinct user IDs with logged hours on any subtask within the project), tasks completed vs total (from `done_subtasks` / `total_subtasks` in the task-completion endpoint), effort logged in hours rounded to one decimal place (from `GET /api/analytics/hours-per-person` aggregated by project), and a status badge.
2. THE Analytics_Dashboard SHALL colour project status badges using Design_System tokens: success (`#22C55E`) for "Completed" and "On Track" project statuses, warning (`#F59E0B`) for "At Risk" project status, danger (`#EF4444`) for "Delayed" project status.
3. THE Analytics_Dashboard SHALL NOT apply any border or background colour to project cards that does not correspond to one of the four Design_System status token colours applied to a semantic state.
4. THE Project Contribution section SHALL source project status, task counts, and completion data from `GET /api/analytics/task-completion`, and effort data from `GET /api/analytics/hours-per-person` joined on `project_id`.
5. IF either `GET /api/analytics/task-completion` or `GET /api/analytics/hours-per-person` fails, THEN THE Analytics_Dashboard SHALL display an error message in the Project Contribution section and SHALL suppress all project cards to avoid rendering partial or stale data.

---

### Requirement 4: Timesheet Grid — Employee View

**User Story:** As an Employee, I want to see a spreadsheet-style grid of my assigned work with date columns, so that I can log and review my hours for any date range in the browser without uploading Excel files.

#### Acceptance Criteria

1. THE Timesheet_Grid SHALL display rows grouped by Project → Task (Activity_Group) → Subtask hierarchy, sorted ascending by Project.name, then Task.position, then Subtask.position, with each Subtask occupying a leaf row.
2. THE Timesheet_Grid SHALL display date columns for the selected week or date range, with one column per calendar day.
3. WHEN the Timesheet_Grid loads with no date range selected, THE Timesheet_Grid SHALL default to the current Monday–Sunday week as the active date range.
4. IF the user selects a date range exceeding 31 calendar days, THEN THE Timesheet_Grid SHALL display an inline error: "Date range cannot exceed 31 days." and SHALL NOT issue a grid data request.
5. WHILE the authenticated user's `task_assignments` contain records with `assigned_date` on or before the range end date, THE Timesheet_Grid SHALL display those subtask rows pre-populated with any existing `timesheet_entries` for that date range.
6. THE Timesheet_Grid SHALL display only subtasks where `task_assignments.user_id = authenticated_user_id`.
7. WHEN no assignments exist for the selected date range, THE Timesheet_Grid SHALL display an empty state message: "No assigned work for this period."
8. IF the `GET /api/timesheet-entries/grid` request fails, THEN THE Timesheet_Grid SHALL display an error message and a "Retry" button, and SHALL NOT display any partial row data.
9. THE Timesheet_Grid SHALL be accessible only to users with a valid authenticated session; unauthenticated requests SHALL redirect to the login page.
10. WHILE the authenticated user's effective role is `MEMBER` or `MANAGER`, THE Timesheet_Grid SHALL display only that user's own subtask rows and entry data, regardless of any `user_id` parameter provided.

---

### Requirement 5: Timesheet Grid — Hour Entry and Editing

**User Story:** As an Employee, I want to enter and edit hours directly in the Timesheet Grid cells, so that I can record my actual effort at the subtask level without managing Excel files.

#### Acceptance Criteria

1. WHEN an Employee clicks a cell in the Timesheet_Grid at the Subtask row / date column intersection, THE Timesheet_Grid SHALL allow inline entry of a numeric `hours_logged` value between 0.01 and 24.00 (inclusive, up to 2 decimal places); entering 0.00 or clearing the cell SHALL be treated as a delete intent for that entry.
2. WHEN an Employee confirms a cell entry (by pressing Enter or clicking away), THE Timesheet_Grid SHALL determine whether to issue a `POST /api/timesheet-entries` (no existing entry for that `user_id + subtask_id + date`) or a `PUT /api/timesheet-entries/:id` (entry already exists), and SHALL issue the appropriate request.
3. WHEN an Employee edits an existing cell, THE Timesheet_Grid SHALL call `PUT /api/timesheet-entries/:id` with the updated `hours_logged` and/or `billable_hours`.
4. THE Timesheet_Grid SHALL display a row-level total column showing the sum of all `hours_logged` values entered across the selected date range for each Subtask row.
5. THE Timesheet_Grid SHALL display a column-level total row showing the sum of all `hours_logged` values entered across all Subtask rows for each date column.
6. WHEN an Employee enters a `billable_hours` value greater than the `hours_logged` value for the same cell, THE Timesheet_Grid SHALL display an inline validation error: "Billable hours cannot exceed logged hours."

---

### Requirement 6: Hour Logging — Single Source of Truth

**User Story:** As a System, I want all actual effort to be recorded exclusively at the Subtask level in `timesheet_entries`, so that reporting is consistent and effort is never double-counted across hierarchy levels.

#### Acceptance Criteria

1. THE System SHALL store all hour logging records in the `timesheet_entries` table with columns: `id`, `user_id`, `subtask_id`, `date`, `hours_logged`, `billable_hours`, `remarks`.
2. THE Effort_Aggregator SHALL compute task-level effort as `SELECT COALESCE(SUM(te.hours_logged), 0) FROM timesheet_entries te JOIN subtasks s ON s.id = te.subtask_id WHERE s.group_id = :task_id`, never by summing pre-computed task-level fields.
3. THE Effort_Aggregator SHALL compute project-level effort as `SELECT COALESCE(SUM(te.hours_logged), 0) FROM timesheet_entries te JOIN subtasks s ON s.id = te.subtask_id JOIN activity_groups ag ON ag.id = s.group_id WHERE ag.project_id = :project_id`, never by summing pre-computed project-level fields.
4. THE `/api/timesheet-entries` endpoint family SHALL NOT accept a `task_id` or `project_id` field in place of `subtask_id` as the target for hour logging; any such request SHALL return HTTP 400.
5. THE System SHALL NOT auto-divide estimated hours from a task across its assigned users when creating `timesheet_entries`.
6. IF a request is received to log hours at the Task or Project level through the `/api/timesheet-entries` endpoints, THEN THE System SHALL return HTTP 400 with an error message indicating that hours must be logged at the Subtask level.

---

### Requirement 7: Estimated vs Actual Hours — Non-Conflation

**User Story:** As an Admin, I want estimated hours and actual logged hours to always be stored and reported separately, so that planning data is never confused with execution reality.

#### Acceptance Criteria

1. THE System SHALL store `estimated_hours` as a dedicated nullable `DECIMAL(8,2)` column on the `projects`, `activity_groups`, and `subtasks` tables; the column SHALL NOT accept negative values.
2. THE System SHALL store `hours_logged` and `billable_hours` only in `timesheet_entries` — these values SHALL NOT be derived from, computed from, or defaulted to `estimated_hours` at any point in the application code.
3. THE System SHALL NOT auto-distribute `estimated_hours` to individual users or generate `timesheet_entries` from estimates under any condition, including task assignment, project creation, or any batch operation.
4. WHEN an Admin views a project or task detail, THE System SHALL display `estimated_hours` and the aggregated `hours_logged` (sum of all `timesheet_entries.hours_logged` for that entity's scope) as separate distinct labelled fields; WHEN no `timesheet_entries` exist for a scope, THE System SHALL display `0.00` for aggregated `hours_logged`.
5. THE System SHALL compute Variance at each scope level as: `Variance = COALESCE(SUM(timesheet_entries.hours_logged), 0) - COALESCE(estimated_hours, 0)`; WHEN `estimated_hours IS NULL`, the System SHALL treat it as `0` for variance computation only and SHALL display the estimated field as "Not set".
6. THE System SHALL validate that any user-submitted `estimated_hours` value is a non-negative number (`>= 0`); IF a negative value is submitted, THEN THE System SHALL return HTTP 400 with an error message indicating that estimated hours must be zero or greater.

---

### Requirement 8: Billable vs Worked Hours

**User Story:** As an Admin, I want to see Total Worked Hours, Total Billable Hours, and Utilization % separately in reports, so that I can distinguish client-billable effort from total effort.

#### Acceptance Criteria

1. THE `timesheet_entries` table SHALL contain both `hours_logged` (actual worked hours) and `billable_hours` (billable portion) as independent `DECIMAL(5,2)` columns (max value 999.99, stored to 2 decimal places).
2. WHEN an Employee submits a `Timesheet_Entry`, THE System SHALL accept a `billable_hours` value between `0.00` and `hours_logged` (inclusive).
3. IF `billable_hours` is absent from or `null` in a `POST /api/timesheet-entries` request body, THEN THE System SHALL default `billable_hours` to `0.00` before persisting the record.
4. IF a `POST /api/timesheet-entries` or `PUT /api/timesheet-entries/:id` request contains a `billable_hours` value outside the range `[0.00, hours_logged]`, THEN THE System SHALL return HTTP 400 with an error message indicating that billable hours must be between 0 and the logged hours value.
5. THE Effort_Aggregator SHALL compute `total_billable_hours` per project as `SELECT COALESCE(SUM(te.billable_hours), 0.0) FROM timesheet_entries te JOIN subtasks s ON s.id = te.subtask_id JOIN activity_groups ag ON ag.id = s.group_id WHERE ag.project_id = :project_id`; NULL `billable_hours` values SHALL be treated as `0.00` in aggregation.
6. WHILE `total_hours_logged > 0` for a user, THE Analytics_Dashboard SHALL display `Utilization_Pct = ROUND(total_billable_hours / total_hours_logged * 100, 1)` for that user in the User Performance section; WHEN `total_hours_logged = 0`, THE Analytics_Dashboard SHALL display "0.0%" rather than performing a division operation.
7. THE System SHALL NOT derive `billable_hours` from `estimated_hours` under any condition.

---

### Requirement 9: Task Assignments and Start Delay Tracking

**User Story:** As an Admin, I want to know when each user was assigned a subtask and when they first logged work on it, so that I can measure how quickly team members start their work.

#### Acceptance Criteria

1. THE System SHALL maintain a `task_assignments` table with columns: `id`, `user_id`, `subtask_id`, `assigned_date` with a unique constraint on `(user_id, subtask_id)`.
2. WHEN a subtask is assigned to a user (via the subtask assignment API with `assignee_id`), THE System SHALL upsert a record in `task_assignments`: if no record exists for `(user_id, subtask_id)`, insert with `assigned_date = CURRENT_DATE`; if reassigning the same user to the same subtask, preserve the original `assigned_date`.
3. THE System SHALL compute `start_delay_days` as `FLOOR(DATEDIFF(MIN(te.date), ta.assigned_date))` per `(user_id, subtask_id)` pair; WHEN no `timesheet_entries` exist for that pair, `start_delay_days` SHALL be `NULL` (not zero).
4. THE Analytics_Dashboard SHALL display per-user start tracking data showing: earliest `assigned_date` across all open (non-Done) subtasks for that user, earliest `timesheet_entry.date` (First Activity Date), and `start_delay_days` calculated as above; WHEN any of these values are absent (no assignments or no entries), THE Analytics_Dashboard SHALL display "--" for that field.
5. WHEN a user has been assigned a subtask but has zero `timesheet_entries` for it, THE Analytics_Dashboard SHALL display Start Delay as `FLOOR(DATEDIFF(CURDATE(), assigned_date))` whole calendar days.
6. WHEN a subtask has no corresponding `task_assignments` record (i.e., it was assigned before this feature was introduced), THE Analytics_Dashboard SHALL omit that subtask from start-delay calculations rather than displaying an error or incorrect value.

---

### Requirement 10: Daily Hour Validation

**User Story:** As an Employee, I want to receive a warning when I log more than 8 hours in a single day, so that I am aware of the entry before submitting it.

#### Acceptance Criteria

1. THE Timesheet_Grid SHALL compute the daily total for a user on a given date as the sum of all `hours_logged` values across all subtask cells for that user and date column, including the value currently being entered.
2. WHEN the computed daily total for a user on a given date exceeds the configured `Daily_Limit` (default: 8 hours), THE Timesheet_Grid SHALL display a warning indicator on that date column header immediately upon the total exceeding the threshold.
3. THE warning indicator SHALL display the message: "Daily total exceeds {limit}h — please verify." where `{limit}` is replaced with the current `Daily_Limit` value.
4. THE System SHALL NOT automatically redistribute or modify any `hours_logged` values when the daily total exceeds `Daily_Limit`.
5. WHERE an Admin has the daily limit override setting enabled for their organisation, THE System SHALL accept `POST /api/timesheet-entries` requests that would cause the daily total to exceed `Daily_Limit` and SHALL return HTTP 201 without a limit error.
6. IF `Daily_Limit` is configured as a hard limit AND the Admin override setting is not enabled, THEN THE System SHALL return HTTP 422 for a `POST /api/timesheet-entries` request that would cause the authenticated user's daily total for that date to exceed `Daily_Limit`, and the error response SHALL include the configured limit value.
7. THE `Daily_Limit` value SHALL be configurable per organisation by an Admin; the default value SHALL be 8 hours.
8. THE Timesheet_Grid SHALL distinguish between a soft-limit warning (visual indicator only, entry saves successfully) and a hard-limit block (entry is rejected with an inline error message) based on the current `Daily_Limit` mode.

---

### Requirement 11: Admin Reporting — Planning vs Execution

**User Story:** As an Admin, I want a report that compares estimated effort against actual logged effort per project and per user, so that I can identify planning accuracy and teams running over or under estimate.

#### Acceptance Criteria

1. WHEN `GET /api/reports/effort-variance` is called, THE System SHALL return an array of per-project rows, each containing: `project_id`, `project_name`, `estimated_hours` (from `projects.estimated_hours`, or `0` if NULL), `actual_hours` (sum of `timesheet_entries.hours_logged` for all subtasks in that project), `billable_hours` (sum of `timesheet_entries.billable_hours` for all subtasks in that project), `variance` (`actual_hours - estimated_hours`), and `variance_label`.
2. THE System SHALL compute `variance_label` as: "Under Estimate" when `variance < 0`, "On Track" when `variance = 0`, "Over Estimate" when `variance > 0`.
3. THE `GET /api/reports/effort-variance` endpoint SHALL support an optional `project_id` query parameter; IF provided and the project does not exist, THE System SHALL return HTTP 404 with an error message indicating the project was not found.
4. THE `GET /api/reports/effort-variance` endpoint SHALL verify the caller's effective role is `ADMIN` or `MASTER_ADMIN` and SHALL return HTTP 403 for any other effective role.
5. WHEN `GET /api/reports/user-effort` is called, THE System SHALL return an array of per-user rows, each containing: `user_id`, `user_name`, `total_hours_logged` (sum of `timesheet_entries.hours_logged` for that user), `total_billable_hours` (sum of `timesheet_entries.billable_hours` for that user), `utilization_pct` (computed as per Requirement 8 Criterion 6), `projects_contributed` (count of distinct project IDs reached via that user's `timesheet_entries`).
6. THE existing `POST /api/reports/generate` endpoint SHALL be extended to support a new `report_type` value of `"effort_variance"` that queries `timesheet_entries` for actual hours data and returns the same row structure as `GET /api/reports/effort-variance`.

---

### Requirement 12: Database Schema Migration

**User Story:** As a Developer, I want the database schema to be extended with the new tables and columns required for the refactor, so that the application can support assignment tracking, subtask-level hour logging, and estimated vs actual reporting.

#### Acceptance Criteria

1. THE Migration_Script SHALL add `estimated_hours DECIMAL(8,2) DEFAULT NULL` to the `projects` table.
2. THE Migration_Script SHALL add `estimated_hours DECIMAL(8,2) DEFAULT NULL` to the `activity_groups` table.
3. THE Migration_Script SHALL add `estimated_hours DECIMAL(8,2) DEFAULT NULL` to the `subtasks` table.
4. THE Migration_Script SHALL create the `task_assignments` table with columns: `id INT AUTO_INCREMENT PRIMARY KEY`, `user_id INT NOT NULL`, `subtask_id INT NOT NULL`, `assigned_date DATE NOT NULL`, `UNIQUE KEY uq_user_subtask (user_id, subtask_id)`, and foreign keys referencing `users(id) ON DELETE CASCADE` and `subtasks(id) ON DELETE CASCADE`.
5. THE Migration_Script SHALL create the `timesheet_entries` table with columns: `id INT AUTO_INCREMENT PRIMARY KEY`, `user_id INT NOT NULL`, `subtask_id INT NOT NULL`, `date DATE NOT NULL`, `hours_logged DECIMAL(5,2) NOT NULL CHECK (hours_logged >= 0.01 AND hours_logged <= 999.99)`, `billable_hours DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (billable_hours >= 0 AND billable_hours <= hours_logged)`, `remarks TEXT DEFAULT NULL`, `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, `UNIQUE KEY uq_entry (user_id, subtask_id, date)`, and foreign keys referencing `users(id) ON DELETE CASCADE` and `subtasks(id) ON DELETE CASCADE`.
6. THE Migration_Script SHALL be idempotent — each `ALTER TABLE` and `CREATE TABLE` statement SHALL be guarded by an existence check using `INFORMATION_SCHEMA` so the script is safe to run multiple times without error.
7. IF any `ALTER TABLE` or `CREATE TABLE` statement fails during execution, THEN THE Migration_Script SHALL halt immediately and report an error message indicating which statement failed.
8. THE Migration_Script SHALL execute all schema changes within a single database transaction so that partial migration states are prevented; if the transaction fails, all changes SHALL be rolled back.

---

### Requirement 13: API — Timesheet Entries CRUD

**User Story:** As a Developer, I want a well-defined REST API for creating, reading, updating, and deleting timesheet entries, so that the Timesheet Grid frontend can interact reliably with the backend.

#### Acceptance Criteria

1. THE System SHALL expose `POST /api/timesheet-entries` accepting `{ subtask_id, date, hours_logged, billable_hours?, remarks? }` and SHALL return HTTP 201 with the created entry containing `id`, `user_id`, `subtask_id`, `date`, `hours_logged`, `billable_hours`, `remarks`, `created_at`.
2. WHEN `POST /api/timesheet-entries` is called, THE System SHALL derive `user_id` from `req.session.userId` and SHALL NOT accept `user_id` in the request body.
3. IF `POST /api/timesheet-entries` contains `hours_logged` less than 0.01 or greater than 24.00, THEN THE System SHALL return HTTP 400 with an error message indicating the valid range is 0.01 to 24.00 hours.
4. IF `POST /api/timesheet-entries` contains `billable_hours` greater than `hours_logged`, THEN THE System SHALL return HTTP 400 indicating billable hours cannot exceed logged hours.
5. IF `POST /api/timesheet-entries` contains `billable_hours` less than 0.00, THEN THE System SHALL return HTTP 400 indicating billable hours must be 0.00 or greater.
6. IF `POST /api/timesheet-entries` contains a `date` that does not match YYYY-MM-DD format or is an invalid calendar date, THEN THE System SHALL return HTTP 400 indicating the required date format.
7. IF `POST /api/timesheet-entries` contains `remarks` exceeding 500 characters, THEN THE System SHALL return HTTP 400 indicating the maximum length is 500 characters.
8. IF `POST /api/timesheet-entries` contains a `subtask_id` not present in the `subtasks` table, THEN THE System SHALL return HTTP 404 indicating the subtask was not found.
9. IF `POST /api/timesheet-entries` is made with `subtask_id` not present in `task_assignments` for the authenticated `user_id`, THEN THE System SHALL return HTTP 403 indicating the user is not assigned to this subtask.
10. IF `POST /api/timesheet-entries` would violate the unique constraint on `(user_id, subtask_id, date)`, THEN THE System SHALL return HTTP 409 indicating an entry already exists for this subtask and date.
11. THE System SHALL expose `PUT /api/timesheet-entries/:id` accepting `{ hours_logged?, billable_hours?, remarks? }` and SHALL return HTTP 200 with the complete updated entry; validation bounds from criteria 3–5 SHALL apply equally.
12. IF `PUT /api/timesheet-entries/:id` specifies an `id` that does not exist, THEN THE System SHALL return HTTP 404.
13. WHEN a `PUT /api/timesheet-entries/:id` request is made by a user whose `user_id` does not match the entry's `user_id`, THE System SHALL return HTTP 403 unless the requester's effective role is `ADMIN` or `MASTER_ADMIN`.
14. THE System SHALL expose `DELETE /api/timesheet-entries/:id` and SHALL return HTTP 200 with `{ deleted: true }`; IF the `id` does not exist, THE System SHALL return HTTP 404; ownership rules from criterion 13 SHALL apply.
15. THE System SHALL expose `GET /api/timesheet-entries` accepting optional query parameters `user_id`, `date_from`, `date_to`, `subtask_id` and SHALL return HTTP 200 with matching entries ordered by `date` ascending; WHEN called by a `MEMBER` or `MANAGER` without a `user_id` param, results SHALL be scoped to `req.session.userId`; WHEN called by an `ADMIN` or `MASTER_ADMIN` without a `user_id` param, results SHALL include all users.
16. THE System SHALL expose `GET /api/timesheet-entries/grid` accepting `user_id`, `date_from`, `date_to` and SHALL return HTTP 200 with `{ projects: [ { project_id, project_name, tasks: [ { task_id, task_name, subtasks: [ { subtask_id, subtask_name, entries: [ { date, hours_logged, billable_hours, entry_id } ] } ] } ] } ] }`; WHEN called by `MEMBER` or `MANAGER`, SHALL scope to `req.session.userId` regardless of `user_id` param; WHEN called by `ADMIN` or `MASTER_ADMIN` with `user_id` param, SHALL return that user's data.

---

### Requirement 14: Backward Compatibility — Existing Timesheet Upload Pipeline

**User Story:** As an Admin, I want the existing Excel upload and time_logs pipeline to continue functioning during the transition, so that there is no disruption to current workflows while the new Timesheet Grid is rolled out.

#### Acceptance Criteria

1. THE existing `POST /api/timesheet/upload`, `POST /api/timesheet/import`, `POST /api/timesheet/enrich`, and `POST /api/timesheet/sync` endpoints SHALL remain functional, meaning their HTTP method, path, accepted parameters, and response schema SHALL NOT be changed; authentication requirements SHALL NOT be relaxed.
2. THE `time_logs` and `activity_logs` tables SHALL retain all existing rows and column definitions; no column SHALL be dropped, renamed, or have its type changed as a result of this migration.
3. THE existing `GET /api/analytics/*` endpoints SHALL continue to return valid responses using their current data sources until a feature flag `USE_TIMESHEET_ENTRIES_AS_SOURCE` is set to `true` in the system configuration.
4. WHEN `USE_TIMESHEET_ENTRIES_AS_SOURCE` is `false` (the default), THE Analytics_Dashboard SHALL read Effort Logged KPIs from `activity_logs` and `time_logs`; WHEN `USE_TIMESHEET_ENTRIES_AS_SOURCE` is `true`, THE Analytics_Dashboard SHALL read Effort Logged KPIs from `timesheet_entries`, using `time_logs` only for records with `date` values not present in `timesheet_entries` for that user and subtask.
5. THE System SHALL NOT execute any `DELETE`, `TRUNCATE`, or destructive `UPDATE` statement against `time_logs`, `activity_logs`, or `timesheet_rows` tables as part of the migration scripts or application code changes in this refactor.

---

### Requirement 15: Data Migration — Existing Effort Data

**User Story:** As an Admin, I want existing hour data from `time_logs` and `activity_logs` to be optionally migrated into `timesheet_entries`, so that historical reporting is unified in the new schema.

#### Acceptance Criteria

1. THE Migration_Script SHALL include an optional data-migration step that reads from `time_logs` and inserts corresponding records into `timesheet_entries`, matching `employee_id → user_id` and resolving `subtask_id` by case-insensitive, whitespace-trimmed exact matching of `activity_group` against `activity_groups.name` and `subtask_name` against `subtasks.name` within that activity group; unresolved columns SHALL be set to their schema-defined defaults.
2. WHEN a `time_logs` record cannot be resolved to a valid `subtask_id` (no match found) OR matches more than one `subtask_id` (ambiguous match), THE Migration_Script SHALL log the full row plus the failure reason ("no_match" or "ambiguous_match") as a line-delimited entry to a migration error log file in the script's working directory and SHALL skip that row without failing the migration.
3. THE Migration_Script SHALL set `billable_hours = 0.00` for all records migrated from `time_logs`, since billing data was not captured in the source table.
4. THE Migration_Script SHALL include an optional data-migration step for `activity_logs`, reading `user_id` and `project_id` directly (no string resolution needed for `user_id`), resolving `subtask_id` by matching against the `activity_logs.subtask_id` foreign key if present, and inserting into `timesheet_entries` with `billable_hours = 0.00` and `remarks = NULL`.
5. WHEN `--dry-run` flag is passed, THE Migration_Script SHALL log all planned `INSERT` statements with their resolved parameter values to stdout and SHALL write zero rows to the database.
6. IF a `timesheet_entries` row already exists for the same `(user_id, subtask_id, date)` natural key, THEN THE Migration_Script SHALL skip that row and increment a deduplicated-rows counter that is printed in the migration summary output.

---

### Requirement 16: Design System Compliance

**User Story:** As a Designer, I want all refactored UI components to use the defined Kanvance Design System tokens, so that the Analytics Dashboard and Timesheet Grid are visually consistent with the rest of the application.

#### Acceptance Criteria

1. THE Analytics_Dashboard SHALL apply the Design_System primary token (`#2563EB`) to buttons, active/selected navigation links, progress bar fill, and selected cell outlines in the Timesheet_Grid; THE Analytics_Dashboard SHALL NOT apply `#2563EB` to visual elements that do not fall into those categories.
2. THE Analytics_Dashboard SHALL apply the Design_System success token (`#22C55E`) exclusively to elements representing a "Completed" or "On Track" project status, or a subtask with status "Done"; THE Analytics_Dashboard SHALL NOT apply `#22C55E` to any other element type.
3. THE Analytics_Dashboard SHALL apply the Design_System warning token (`#F59E0B`) exclusively to elements representing an "At Risk" project status or a date column whose daily total exceeds the soft `Daily_Limit`; THE Analytics_Dashboard SHALL NOT apply `#F59E0B` to any other element type.
4. THE Analytics_Dashboard SHALL apply the Design_System danger token (`#EF4444`) exclusively to elements representing a "Delayed" project status, a subtask with status "Blocked", or a date column whose entry was rejected by a hard `Daily_Limit`; THE Analytics_Dashboard SHALL NOT apply `#EF4444` to any other element type.
5. THE Analytics_Dashboard SHALL NOT apply any border or background colour to cards, chart bars, badges, icons, or table rows unless that colour is one of the four Design_System tokens (`#2563EB`, `#22C55E`, `#F59E0B`, `#EF4444`) applied to a semantic state defined in this requirement.
6. THE Timesheet_Grid SHALL apply Design_System tokens to cell-level status indicators using the following mapping: primary (`#2563EB`) for an actively selected/focused cell, success (`#22C55E`) for date column totals within `Daily_Limit`, warning (`#F59E0B`) for date column totals that exceed the soft `Daily_Limit`, danger (`#EF4444`) for cells or columns rejected by a hard `Daily_Limit`.

---

### Requirement 17: Role-Based Access Control

**User Story:** As a System, I want Analytics and Admin Reporting to be accessible only to Admins, while the Timesheet Grid is accessible to all authenticated users, so that sensitive data is not exposed to non-privileged users.

#### Acceptance Criteria

1. THE Analytics_Dashboard SHALL be accessible only to users whose effective role (as computed by `getEffectiveRole(session)`) is `ADMIN` or `MASTER_ADMIN`.
2. IF a user whose effective role is not `ADMIN` or `MASTER_ADMIN` navigates to the Analytics Dashboard route, THEN the frontend SHALL redirect that user to `/dashboard` and SHALL NOT render any analytics data or issue any analytics API requests.
3. IF a request is made to any `GET /api/analytics/*` endpoint by a user whose effective role is `MEMBER` or `MANAGER`, THEN THE System SHALL return HTTP 403 and SHALL NOT return any analytics payload.
4. WHILE the authenticated user's effective role is `MEMBER` or `MANAGER`, THE `GET /api/timesheet-entries/grid` endpoint SHALL return only entries where `timesheet_entries.user_id = req.session.userId`, silently ignoring any `user_id` query parameter supplied in the request.
5. WHEN `GET /api/timesheet-entries/grid` is called by a user whose effective role is `ADMIN` or `MASTER_ADMIN` and a `user_id` query parameter is provided, THE System SHALL return the grid data for the specified `user_id`.
6. IF a `GET /api/timesheet-entries/grid` request is made by a user whose effective role is `MEMBER` or `MANAGER` with a `user_id` query parameter that does not match `req.session.userId`, THEN THE System SHALL return HTTP 403 and SHALL NOT return any entries for the requested user.
