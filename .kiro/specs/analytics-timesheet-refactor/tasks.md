# Implementation Plan: Analytics Dashboard Refactor, Timesheet Module Overhaul & Reporting Enhancement

## Overview

Implement backend changes across three work streams: (1) database schema migration adding `estimated_hours`, `task_assignments`, and `timesheet_entries`; (2) a new `/api/timesheet-entries` REST API with CRUD + grid endpoint; (3) analytics model updates behind a feature flag with RBAC enforcement; and (4) new effort-variance/user-effort reporting endpoints. All code follows the existing Express 5 + MySQL (`pool.execute`) + session-based auth pattern.

---

## Tasks

- [x] 1. Database migration script
  - [x] 1.1 Create `backend/src/migrations/001_analytics_timesheet_refactor.js`
    - Open a connection and `BEGIN` transaction
    - Guard each `ALTER TABLE` with an `INFORMATION_SCHEMA.COLUMNS` existence check before adding `estimated_hours DECIMAL(8,2) DEFAULT NULL` to `projects`, `activity_groups`, and `subtasks`
    - Add `CREATE TABLE IF NOT EXISTS task_assignments` with `id`, `user_id`, `subtask_id`, `assigned_date`, `UNIQUE KEY uq_user_subtask`, and FK constraints referencing `users(id) ON DELETE CASCADE` and `subtasks(id) ON DELETE CASCADE`
    - Add `CREATE TABLE IF NOT EXISTS timesheet_entries` with all columns per Req 12.5 (including `CHECK` constraints, `UNIQUE KEY uq_entry`, and FK constraints)
    - `COMMIT` on success; catch any error, `ROLLBACK`, and rethrow with the failing statement identified
    - Support `--dry-run` CLI flag: log all SQL to stdout, write nothing to DB
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [x] 1.2 Add optional `--migrate-data` step inside the same migration file
    - Read rows from `time_logs`; resolve `subtask_id` via case-insensitive, whitespace-trimmed match of `activity_group` → `activity_groups.name` and `subtask_name` → `subtasks.name`
    - For each unresolved or ambiguous row, append a line-delimited entry to `migration_errors.log` with the full row and reason (`no_match` / `ambiguous_match`); skip that row
    - For matched rows, batch-insert into `timesheet_entries` with `billable_hours = 0.00`; skip rows where `(user_id, subtask_id, date)` already exists and increment a dedup counter
    - Read rows from `activity_logs` using `activity_logs.subtask_id` FK directly; insert into `timesheet_entries` with `billable_hours = 0.00, remarks = NULL`; skip existing unique-key rows
    - Print a migration summary to stdout (rows inserted, skipped, deduped, errors)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 2. `timesheetEntries` model, controller, and router
  - [x] 2.1 Create `backend/src/models/timesheetEntries.model.js`
    - Export `create(data)`: `INSERT INTO timesheet_entries` with parameterised `pool.execute`; return inserted row
    - Export `findById(id)`: `SELECT * FROM timesheet_entries WHERE id = ?`; return row or `null`
    - Export `list({ userId, dateFrom, dateTo, subtaskId })`: build dynamic `WHERE` clause and return rows ordered by `date ASC`
    - Export `grid({ userId, dateFrom, dateTo })`: execute the JOIN query from the design (`task_assignments JOIN subtasks JOIN activity_groups JOIN projects LEFT JOIN timesheet_entries`) and return the flat result set
    - Export `update(id, data)`: accept only `hours_logged`, `billable_hours`, `remarks`; build `SET` clause dynamically; return updated row
    - Export `remove(id)`: `DELETE FROM timesheet_entries WHERE id = ?`
    - Export `dailyTotal(userId, date)`: `SELECT COALESCE(SUM(hours_logged), 0) AS day_total FROM timesheet_entries WHERE user_id = ? AND date = ?`
    - _Requirements: 13.1, 13.2, 13.11, 13.15, 13.16_

  - [x] 2.2 Create `backend/src/controllers/timesheetEntries.controller.js`
    - Implement `create` handler: validate `hours_logged` [0.01–24.00], `billable_hours` [0–hours_logged], `date` YYYY-MM-DD + valid calendar date, `remarks` ≤ 500 chars; reject `task_id` / `project_id` in body with HTTP 400; derive `user_id` from `req.session.userId`; check `subtasks` table (404 if missing); check `task_assignments` for user+subtask (403 if missing); check daily limit via `dailyTotal` and env vars (`DAILY_LIMIT_HOURS`, `DAILY_LIMIT_MODE`); `INSERT` and catch `ER_DUP_ENTRY` → 409; return 201
    - Implement `list` handler: apply role scoping (MEMBER/MANAGER always use session userId; ADMIN/MASTER_ADMIN use param if provided); call `model.list`; return 200
    - Implement `grid` handler: apply same role scoping; call `model.grid`; shape flat SQL rows into nested `{ projects → tasks → subtasks → entries }` JS structure; return 200
    - Implement `update` handler: find entry by id (404 if missing); verify ownership or ADMIN role (403 if mismatch); validate updated fields; call `model.update`; return 200
    - Implement `remove` handler: find entry by id (404 if missing); verify ownership or ADMIN role (403 if mismatch); call `model.remove`; return `{ deleted: true }` with 200
    - _Requirements: 13.1–13.16, 6.4, 6.6, 8.2–8.5, 10.5–10.6, 17.4–17.6_

  - [x] 2.3 Create `backend/src/routers/timesheetEntries.routes.js`
    - Register all five routes: `POST /`, `GET /`, `GET /grid`, `PUT /:id`, `DELETE /:id` pointing to the controller handlers
    - No additional auth middleware needed (covered by global `requireAuth` in `server.js`)
    - _Requirements: 13.1, 13.11, 13.14, 13.15, 13.16_

  - [x] 2.4 Register the new router in `backend/server.js`
    - Add `app.use("/api/timesheet-entries", require("./src/routers/timesheetEntries.routes"))` in the protected-routes block, following the existing pattern
    - _Requirements: 13.1_

- [~] 3. Checkpoint — timesheet entries API
  - Ensure the migration script runs without error on a local DB (`node backend/src/migrations/001_analytics_timesheet_refactor.js --dry-run`).
  - Ensure all five `/api/timesheet-entries` routes are reachable and return expected HTTP status codes for happy-path and validation-error cases.
  - Ask the user if any questions arise before proceeding.

- [x] 4. `subtask.model.js` — task_assignments upsert hook
  - [x] 4.1 Modify `backend/src/models/subtask.model.js` `update()` to upsert `task_assignments`
    - After the `UPDATE subtasks SET ... WHERE id = ?` statement, check if `data.assignee_id` is present in the payload
    - If present, execute `INSERT INTO task_assignments (user_id, subtask_id, assigned_date) VALUES (?, ?, CURDATE()) ON DUPLICATE KEY UPDATE assigned_date = assigned_date`
    - This is the sole code path that inserts into `task_assignments`
    - _Requirements: 9.1, 9.2_

- [x] 5. Analytics model — feature-flag switch and new `startDelayByUser`
  - [x] 5.1 Modify `backend/src/models/analytics.model.js` — `summary()` feature-flag branch
    - At the top of `summary()`, read `process.env.USE_TIMESHEET_ENTRIES_AS_SOURCE`
    - When `true`, replace the `activity_logs` hours subquery with `SELECT ROUND(COALESCE(SUM(hours_logged), 0), 1) AS total_hours_logged FROM timesheet_entries`
    - When `false` (default), keep existing query unchanged
    - _Requirements: 1.2, 14.3, 14.4_

  - [x] 5.2 Modify `backend/src/models/analytics.model.js` — `teamUtilisation()` feature-flag branch
    - When flag is `true`, replace the `time_logs` subquery with the `timesheet_entries` GROUP BY `user_id` query from the design
    - Add `total_billable_hours` and `utilization_pct` columns to the result set (computed via `ROUND(COALESCE(SUM(te.billable_hours),0) / NULLIF(...) * 100, 1)`)
    - When flag is `false`, keep existing query unchanged
    - _Requirements: 2.6, 8.6, 14.3, 14.4_

  - [x] 5.3 Modify `backend/src/models/analytics.model.js` — `hoursPerPersonPerProject()` feature-flag branch
    - When flag is `true`, replace the `activity_logs` join with `timesheet_entries JOIN subtasks JOIN activity_groups JOIN projects JOIN customers JOIN users` per the design query
    - When flag is `false`, keep existing query unchanged
    - _Requirements: 3.4, 14.3, 14.4_

  - [x] 5.4 Add `startDelayByUser()` export to `backend/src/models/analytics.model.js`
    - Implement the SQL from the design: join `users → task_assignments → subtasks (status != 'Done') LEFT JOIN timesheet_entries`; return `user_id`, `earliest_assigned_date`, `first_activity_date`, `start_delay_days` (using `FLOOR(DATEDIFF(COALESCE(MIN(te.date), CURDATE()), MIN(ta.assigned_date)))`)
    - Use a `JOIN` (not `LEFT JOIN`) on `task_assignments` so users with no assignments are excluded from the calculation
    - Return `NULL` for `start_delay_days` when no `timesheet_entries` exist for a pair
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

- [x] 6. Analytics controller and routes — RBAC enforcement and new handler
  - [x] 6.1 Modify `backend/src/routers/analytics.routes.js` — add `requireRole` guard
    - Import `requireRole` from `../middlewares/requireRole`
    - Create `const adminOnly = requireRole("ADMIN", "MASTER_ADMIN")`
    - Add `adminOnly` as middleware on all existing routes: `/summary`, `/task-completion`, `/team-utilisation`, `/hours-per-person`, `/blocked-tasks`, `/progress-trend`, `/status-breakdown`, `/hours-per-day`
    - Add new route: `router.get("/start-delay", adminOnly, ctrl.startDelay)`
    - _Requirements: 1.6, 17.1, 17.3_

  - [x] 6.2 Modify `backend/src/controllers/analytics.controller.js` — clean up soft filter and add `startDelay` handler
    - Remove the `isMemberLevel` soft-filter branches in `taskCompletion`, `teamUtilisation`, and `hoursPerPerson` — these are now redundant because the middleware hard-blocks non-admins
    - Add `exports.startDelay` handler: call `AnalyticsModel.startDelayByUser()`, return JSON; replace absent values with `null` (frontend maps to "--")
    - _Requirements: 9.4, 9.5, 17.3_

- [x] 7. Project and group model — estimated hours in detail views
  - [x] 7.1 Modify `backend/src/models/project.model.js` `getById()` to include `estimated_hours` and computed actuals
    - Add `p.estimated_hours` to the SELECT
    - Add an inline subquery for `actual_hours_logged` (sum of `timesheet_entries.hours_logged` via subtasks + activity_groups for this project)
    - Add an inline `variance` expression: `COALESCE(actual_sum, 0) - COALESCE(p.estimated_hours, 0)`
    - _Requirements: 7.4, 7.5_

  - [x] 7.2 Modify `backend/src/models/group.model.js` (or equivalent activity_groups query) `getById()` to include `estimated_hours` and computed actuals at task level
    - Add `ag.estimated_hours` to the SELECT
    - Add an inline subquery for `actual_hours_logged` (sum of `timesheet_entries.hours_logged` for subtasks within this `group_id`)
    - Add `variance` expression
    - _Requirements: 7.4, 7.5_

- [ ] 8. Reports — effort-variance and user-effort endpoints
  - [-] 8.1 Add `effortVariance` and `userEffort` query functions to `backend/src/controllers/reports.controller.js` (or extract to a `reports.model.js`)
    - Implement `effortVariance(projectId?)`: run the LEFT JOIN SQL from the design (`projects LEFT JOIN activity_groups LEFT JOIN subtasks LEFT JOIN timesheet_entries`); filter by `project_id` when provided (return 404 if project not found); compute `variance_label` in JS (`< 0` → "Under Estimate", `= 0` → "On Track", `> 0` → "Over Estimate"); return per-project rows
    - Implement `userEffort()`: run the LEFT JOIN SQL from the design (`users LEFT JOIN timesheet_entries LEFT JOIN subtasks LEFT JOIN activity_groups`); filter `deleted_at IS NULL AND status = 'active'`; compute `utilization_pct` in JS (guard divide-by-zero); return per-user rows
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

  - [ ] 8.2 Add `exports.effortVariance` and `exports.userEffort` controller handlers to `backend/src/controllers/reports.controller.js`
    - `effortVariance`: read optional `?project_id` query param; call `effortVariance(projectId)`; return 200 JSON array; return 404 if project not found; return 403 (handled by route middleware)
    - `userEffort`: call `userEffort()`; return 200 JSON array
    - _Requirements: 11.1, 11.3, 11.4, 11.5_

  - [~] 8.3 Extend `exports.generate` in `reports.controller.js` to handle `report_type: "effort_variance"`
    - Add a `case "effort_variance"` branch in the `switch` statement
    - Run the same `effortVariance` SQL with an additional `AND te.date BETWEEN ? AND ?` filter on `date_range.start` / `date_range.end`
    - Pass results to the existing `generateExcelReport` helper with report name "Effort Variance Report"
    - _Requirements: 11.6_

  - [~] 8.4 Modify `backend/src/routers/reports.routes.js` — add new admin-only routes
    - Import `requireRole` and create `adminOnly = requireRole("ADMIN", "MASTER_ADMIN")`
    - Add `router.get("/effort-variance", adminOnly, ctrl.effortVariance)`
    - Add `router.get("/user-effort", adminOnly, ctrl.userEffort)`
    - _Requirements: 11.4_

- [~] 9. Checkpoint — analytics, reports, and subtask upsert
  - Verify analytics routes return HTTP 403 for a MEMBER session and valid data for an ADMIN session.
  - Verify `PATCH /api/subtasks/:id` with `assignee_id` creates a row in `task_assignments`.
  - Verify `GET /api/reports/effort-variance` and `GET /api/reports/user-effort` return expected shapes.
  - Ask the user if any questions arise before proceeding.

- [x] 10. Daily limit configuration wiring
  - [x] 10.1 Ensure `DAILY_LIMIT_HOURS` and `DAILY_LIMIT_MODE` are read from `process.env` in `timesheetEntries.controller.js`
    - Parse `DAILY_LIMIT_HOURS` as a float with default `8`
    - Parse `DAILY_LIMIT_MODE` as `"soft"` or `"hard"` with default `"soft"`
    - In the `create` handler: after fetching `dailyTotal`, if `day_total + hours_logged > DAILY_LIMIT_HOURS`:
      - `soft` mode: allow INSERT, set `daily_limit_warning: true` and `daily_limit: N` on the 201 response body
      - `hard` mode: return HTTP 422 with `{ error: "Daily total would exceed Xh limit", limit: N }`
    - _Requirements: 10.5, 10.6, 10.7_

  - [x] 10.2 Add `DAILY_LIMIT_HOURS` and `DAILY_LIMIT_MODE` entries to `backend/.env` (with default values as comments)
    - Add `# DAILY_LIMIT_HOURS=8` and `# DAILY_LIMIT_MODE=soft` as documented defaults
    - _Requirements: 10.7_

- [~] 11. Final checkpoint — end-to-end verification
  - Run the migration with `--dry-run` and confirm all DDL statements are printed correctly.
  - Confirm `POST /api/timesheet-entries` returns 201 for a valid body, 400 for out-of-range `hours_logged`, 403 for unassigned subtask, 409 for duplicate.
  - Confirm `GET /api/timesheet-entries/grid` returns the nested hierarchy.
  - Confirm `GET /api/analytics/summary` returns 403 for MEMBER and 200 for ADMIN.
  - Confirm `GET /api/reports/effort-variance` returns the correct `variance_label` values.
  - Ensure all tests pass; ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP (none in this plan — all tasks are backend implementation required by requirements).
- The feature flag `USE_TIMESHEET_ENTRIES_AS_SOURCE` defaults to `false`; existing `time_logs` / `activity_logs` analytics remain unchanged until the flag is toggled.
- The migration script must remain idempotent — safe to re-run. Use `INFORMATION_SCHEMA` guards for `ALTER TABLE` and `IF NOT EXISTS` for `CREATE TABLE`.
- No frontend tasks are included per the scope of this spec.
- All SQL uses `pool.execute()` with parameterised `?` placeholders — no string interpolation.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.1"] },
    { "id": 3, "tasks": ["2.4", "5.1", "5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["6.1", "6.2", "7.1", "7.2", "10.1", "10.2"] },
    { "id": 5, "tasks": ["8.1", "8.2"] },
    { "id": 6, "tasks": ["8.3", "8.4"] }
  ]
}
```
