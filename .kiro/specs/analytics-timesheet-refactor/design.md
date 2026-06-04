# Design Document — Analytics Dashboard Refactor, Timesheet Module Overhaul & Reporting Enhancement

## Overview

This document describes the technical architecture for three tightly coupled work streams in Kanvance:

1. **Analytics Dashboard** — Admin-only KPI cards, user performance rows, project contribution cards, and charts replacing the current table-heavy layout.
2. **Timesheet Grid** — In-browser spreadsheet replacing the Excel-upload-only workflow; employees log hours at the Subtask level.
3. **Hour Logging & Reporting** — New `timesheet_entries` table as single source of truth; `task_assignments` table for assignment tracking; estimated vs actual hours kept strictly separate.

The design follows the existing project conventions: **Express 5 + MySQL (mysql2/promise), raw SQL, session-based auth, router → controller → model layering**.

---

## Architecture Overview

```
server.js
  ├── /api/timesheet-entries   → timesheetEntries.routes.js → timesheetEntries.controller.js → timesheetEntries.model.js
  ├── /api/timesheet           → (unchanged) timesheet.routes.js
  ├── /api/analytics           → analytics.routes.js (add requireRole guard) → analytics.controller.js → analytics.model.js (feature-flag aware)
  ├── /api/reports             → reports.routes.js (add effort-variance, user-effort) → reports.controller.js
  └── migrations/
        └── 001_analytics_timesheet_refactor.js  (idempotent, transactional)
```

No new external dependencies are introduced. All SQL is raw `pool.execute()` / `pool.query()` matching existing patterns.

---

## Database Schema Changes

### 1. New columns (idempotent `ALTER TABLE`)

| Table | Column | Type | Default |
|---|---|---|---|
| `projects` | `estimated_hours` | `DECIMAL(8,2)` | `NULL` |
| `activity_groups` | `estimated_hours` | `DECIMAL(8,2)` | `NULL` |
| `subtasks` | `estimated_hours` | `DECIMAL(8,2)` | `NULL` |

### 2. New table: `task_assignments`

```sql
CREATE TABLE IF NOT EXISTS task_assignments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  subtask_id    INT NOT NULL,
  assigned_date DATE NOT NULL,
  UNIQUE KEY uq_user_subtask (user_id, subtask_id),
  CONSTRAINT fk_ta_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ta_subtask FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE
);
```

### 3. New table: `timesheet_entries`

```sql
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  subtask_id    INT NOT NULL,
  date          DATE NOT NULL,
  hours_logged  DECIMAL(5,2) NOT NULL
                  CHECK (hours_logged  >= 0.01 AND hours_logged  <= 999.99),
  billable_hours DECIMAL(5,2) NOT NULL DEFAULT 0
                  CHECK (billable_hours >= 0   AND billable_hours <= hours_logged),
  remarks       TEXT DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_entry (user_id, subtask_id, date),
  CONSTRAINT fk_te_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_te_subtask FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE
);
```

### 4. Backward-compatibility guarantee
- **No `DROP COLUMN`, no `RENAME COLUMN`, no type changes** on any existing table.
- `time_logs` and `activity_logs` are untouched.

---

## Migration Script

**File:** `backend/src/migrations/001_analytics_timesheet_refactor.js`

### Design

- Wraps all DDL in a single `BEGIN / COMMIT` transaction; rolls back and throws on any failure.
- Each `ALTER TABLE` is guarded by an `INFORMATION_SCHEMA.COLUMNS` existence check.
- Each `CREATE TABLE` uses `IF NOT EXISTS`.
- Accepts a `--dry-run` CLI flag: logs SQL to stdout, writes nothing.
- Optional data-migration step (`--migrate-data` flag): reads `time_logs`, resolves `subtask_id` by case-insensitive name matching, inserts into `timesheet_entries` with `billable_hours = 0`. Skips / logs unresolved rows to `migration_errors.log`.

### Execution flow

```
1. Open connection, BEGIN transaction
2. Add estimated_hours to projects       (IF NOT EXISTS guard)
3. Add estimated_hours to activity_groups (IF NOT EXISTS guard)
4. Add estimated_hours to subtasks        (IF NOT EXISTS guard)
5. CREATE TABLE IF NOT EXISTS task_assignments
6. CREATE TABLE IF NOT EXISTS timesheet_entries
7. COMMIT
8. (optional --migrate-data) batch-insert time_logs → timesheet_entries, log errors
```

---

## Feature Flag

**`USE_TIMESHEET_ENTRIES_AS_SOURCE`** — read from `process.env`.

- `false` (default): analytics models read from `activity_logs` / `time_logs` (current behaviour, unchanged).
- `true`: analytics models read `hours_logged` from `timesheet_entries`. For users/projects with no `timesheet_entries` rows, `COALESCE(SUM(...), 0)` returns 0 naturally — no fallback to `time_logs` needed in the query path. The migration data step handles historical data alignment when the flag is toggled.

The flag is checked at the top of each affected model function — not at the controller or middleware layer — to keep the switch localised and testable.

---

## New API: `/api/timesheet-entries`

### Route file: `backend/src/routers/timesheetEntries.routes.js`

```
POST   /api/timesheet-entries            → ctrl.create
GET    /api/timesheet-entries            → ctrl.list       (?user_id, date_from, date_to, subtask_id)
GET    /api/timesheet-entries/grid       → ctrl.grid       (?user_id, date_from, date_to)
PUT    /api/timesheet-entries/:id        → ctrl.update
DELETE /api/timesheet-entries/:id        → ctrl.remove
```

Registered in `server.js` **before** the generic `requireAuth` block already wraps all `/api/*` routes, so no additional auth wiring is needed.

### Controller: `timesheetEntries.controller.js`

**Validation helpers** (inline, no new library):

| Rule | HTTP status |
|---|---|
| `hours_logged` outside [0.01, 24.00] | 400 |
| `billable_hours` < 0 | 400 |
| `billable_hours` > `hours_logged` | 400 |
| `date` not matching `YYYY-MM-DD` or invalid calendar date | 400 |
| `remarks` > 500 chars | 400 |
| `task_id` or `project_id` present in body | 400 |
| `subtask_id` not found | 404 |
| user not in `task_assignments` for this subtask | 403 |
| unique constraint violation `(user_id, subtask_id, date)` | 409 |

Role scoping in `list` and `grid`:
- MEMBER / MANAGER: always scoped to `req.session.userId`, any `user_id` param is silently ignored.
- ADMIN / MASTER_ADMIN: if `user_id` param provided, use it; otherwise return all.

#### `POST /api/timesheet-entries`

```
1. Validate body fields (see table above)
2. Derive user_id from req.session.userId (never from body)
3. SELECT subtask from subtasks WHERE id = subtask_id → 404 if missing
4. SELECT from task_assignments WHERE user_id AND subtask_id → 403 if missing
5. Check daily total: SELECT SUM(hours_logged) FROM timesheet_entries WHERE user_id AND date
   → If org has hard Daily_Limit: return 422 if total would exceed limit
6. INSERT into timesheet_entries; catch ER_DUP_ENTRY → 409
7. Return 201 with created row
```

#### `GET /api/timesheet-entries/grid`

Returns the nested project → task → subtask → entries structure. Single query using JOIN + GROUP_CONCAT, then shaped in JS:

```sql
SELECT
  p.id AS project_id, p.name AS project_name,
  ag.id AS task_id, ag.name AS task_name, ag.position AS task_position,
  s.id AS subtask_id, s.name AS subtask_name, s.position AS subtask_position,
  te.id AS entry_id, te.date, te.hours_logged, te.billable_hours
FROM task_assignments ta
JOIN subtasks s        ON s.id  = ta.subtask_id
JOIN activity_groups ag ON ag.id = s.group_id
JOIN projects p        ON p.id  = ag.project_id
LEFT JOIN timesheet_entries te
  ON te.subtask_id = ta.subtask_id
  AND te.user_id   = ta.user_id
  AND te.date BETWEEN :date_from AND :date_to
WHERE ta.user_id = :user_id
  AND ta.assigned_date <= :date_to
ORDER BY p.name ASC, ag.position ASC, s.position ASC, te.date ASC
```

JS shaping: reduce rows into `projects[]` → `tasks[]` → `subtasks[]` → `entries[]`.

### Model: `timesheetEntries.model.js`

Exports: `create`, `findById`, `list`, `grid`, `update`, `remove`, `dailyTotal`.

All queries use `pool.execute()` with parameterised `?` placeholders.

---

## Analytics Dashboard Changes

### RBAC enforcement

Add `requireRole("ADMIN", "MASTER_ADMIN")` to **all** routes in `analytics.routes.js`. Currently the controller does a soft `isMemberLevel` filter — this replaces that with a hard 403 at the middleware level, consistent with Req 17.3.

```js
// analytics.routes.js
const requireRole = require("../middlewares/requireRole");
const adminOnly   = requireRole("ADMIN", "MASTER_ADMIN");

router.get("/summary",          adminOnly, ctrl.summary);
router.get("/task-completion",  adminOnly, ctrl.taskCompletion);
router.get("/team-utilisation", adminOnly, ctrl.teamUtilisation);
router.get("/hours-per-person", adminOnly, ctrl.hoursPerPerson);
// ... all routes get adminOnly
```

### `analytics.model.js` — feature-flag-aware query switching

#### `summary()` — when flag is true, replace the `activity_logs` hours query:

```sql
-- USE_TIMESHEET_ENTRIES_AS_SOURCE = true
SELECT ROUND(COALESCE(SUM(hours_logged), 0), 1) AS total_hours_logged
FROM timesheet_entries
```

#### `teamUtilisation()` — when flag is true, replace the `time_logs` subquery:

```sql
-- replace tl_agg subquery
SELECT
  user_id,
  ROUND(SUM(hours_logged), 1) AS total_hours,
  COUNT(DISTINCT subtask_id)  AS projects_worked,   -- proxy; real project count from s_agg
  COUNT(DISTINCT date)        AS days_logged
FROM timesheet_entries
GROUP BY user_id
```

Also add `total_billable_hours` and `utilization_pct` to the `teamUtilisation` result set (needed by Req 8.6):

```sql
ROUND(
  COALESCE(SUM(te.billable_hours), 0) /
  NULLIF(ROUND(SUM(te.hours_logged), 1), 0) * 100
, 1) AS utilization_pct
```

#### `hoursPerPersonPerProject()` — when flag is true, join `timesheet_entries` instead of `activity_logs`:

```sql
SELECT
  u.id AS user_id, u.name AS user_name,
  p.id AS project_id, c.name AS customer_name, p.name AS project_name,
  p.type AS project_type,
  ROUND(SUM(te.hours_logged), 1) AS hours_logged
FROM timesheet_entries te
JOIN subtasks s        ON s.id  = te.subtask_id
JOIN activity_groups ag ON ag.id = s.group_id
JOIN projects p        ON p.id  = ag.project_id
JOIN customers c       ON c.id  = p.customer_id
JOIN users u           ON u.id  = te.user_id
GROUP BY u.id, p.id
ORDER BY u.name, hours_logged DESC
```

#### New model method: `startDelayByUser()` (Req 9.4–9.5)

```sql
SELECT
  u.id                                                     AS user_id,
  MIN(ta.assigned_date)                                    AS earliest_assigned_date,
  MIN(te.date)                                             AS first_activity_date,
  FLOOR(DATEDIFF(
    COALESCE(MIN(te.date), CURDATE()),
    MIN(ta.assigned_date)
  ))                                                       AS start_delay_days
FROM users u
JOIN task_assignments ta ON ta.user_id = u.id
JOIN subtasks s          ON s.id = ta.subtask_id AND s.status != 'Done'
LEFT JOIN timesheet_entries te ON te.user_id = ta.user_id AND te.subtask_id = ta.subtask_id
WHERE u.deleted_at IS NULL AND u.status = 'active'
GROUP BY u.id
```

Returns `NULL` for `start_delay_days` when no `task_assignments` exist (subtask excluded per Req 9.6 via `JOIN` — not `LEFT JOIN` — on `task_assignments`).

New controller method `startDelay` and route `GET /api/analytics/start-delay`.

---

## `subtask.model.js` — task_assignments upsert hook

When `subtask.update()` is called with `assignee_id` in the data payload, the model performs an upsert:

```sql
INSERT INTO task_assignments (user_id, subtask_id, assigned_date)
VALUES (?, ?, CURDATE())
ON DUPLICATE KEY UPDATE
  assigned_date = assigned_date   -- preserve original date, do nothing
```

This is the only place `task_assignments` rows are created — no other code path touches this table for inserts.

---

## Reports API Changes

### New endpoints registered in `reports.routes.js`

```
GET  /api/reports/effort-variance   → ctrl.effortVariance   (adminOnly)
GET  /api/reports/user-effort       → ctrl.userEffort       (adminOnly)
```

`POST /api/reports/generate` extended with `report_type: "effort_variance"`.

### `GET /api/reports/effort-variance`

Optional `?project_id=` query param. Returns per-project rows:

```sql
SELECT
  p.id                                                        AS project_id,
  p.name                                                      AS project_name,
  COALESCE(p.estimated_hours, 0)                              AS estimated_hours,
  ROUND(COALESCE(SUM(te.hours_logged),  0), 2)                AS actual_hours,
  ROUND(COALESCE(SUM(te.billable_hours),0), 2)                AS billable_hours,
  ROUND(COALESCE(SUM(te.hours_logged),  0) -
        COALESCE(p.estimated_hours, 0),                    2) AS variance
FROM projects p
LEFT JOIN activity_groups ag ON ag.project_id = p.id
LEFT JOIN subtasks s         ON s.group_id    = ag.id
LEFT JOIN timesheet_entries te ON te.subtask_id = s.id
[WHERE p.id = :project_id]
GROUP BY p.id
ORDER BY p.name ASC
```

`variance_label` computed in JS: `< 0` → "Under Estimate", `= 0` → "On Track", `> 0` → "Over Estimate".

### `GET /api/reports/user-effort`

```sql
SELECT
  u.id                                                        AS user_id,
  u.name                                                      AS user_name,
  ROUND(COALESCE(SUM(te.hours_logged),   0), 2)               AS total_hours_logged,
  ROUND(COALESCE(SUM(te.billable_hours), 0), 2)               AS total_billable_hours,
  ROUND(
    COALESCE(SUM(te.billable_hours), 0) /
    NULLIF(COALESCE(SUM(te.hours_logged), 0), 0) * 100
  , 1)                                                        AS utilization_pct,
  COUNT(DISTINCT ag.project_id)                               AS projects_contributed
FROM users u
LEFT JOIN timesheet_entries te ON te.user_id = u.id
LEFT JOIN subtasks s           ON s.id = te.subtask_id
LEFT JOIN activity_groups ag   ON ag.id = s.group_id
WHERE u.deleted_at IS NULL AND u.status = 'active'
GROUP BY u.id
ORDER BY total_hours_logged DESC
```

### `POST /api/reports/generate` — `effort_variance` type

Delegates to the same SQL as `effortVariance`, respects the `date_range` filter by adding `AND te.date BETWEEN :start AND :end`, returns JSON or Excel via the existing `generateExcelReport` helper.

---

## Daily Limit Logic

Stored in a new `org_settings` table or, to avoid a new table, as an in-process constant + env var:

- `DAILY_LIMIT_HOURS` (default `8`) — numeric env var.
- `DAILY_LIMIT_MODE` (`soft` | `hard`, default `soft`).

On `POST /api/timesheet-entries`:
1. Query `SELECT COALESCE(SUM(hours_logged), 0) AS day_total FROM timesheet_entries WHERE user_id = ? AND date = ?`.
2. If `day_total + hours_logged > DAILY_LIMIT_HOURS`:
   - `soft`: allow insert, return 201 with `{ ..., daily_limit_warning: true, daily_limit: N }`.
   - `hard`: return 422 `{ error: "Daily total would exceed Xh limit", limit: N }`.

---

## Effort Aggregator Pattern

The `Effort_Aggregator` is not a separate service — it is a set of SQL expressions used inline in model queries wherever task-level or project-level totals are needed. This matches the existing codebase pattern of embedding aggregation in SQL rather than loading data into memory.

Task-level:
```sql
SELECT COALESCE(SUM(te.hours_logged), 0)
FROM timesheet_entries te
JOIN subtasks s ON s.id = te.subtask_id
WHERE s.group_id = :task_id
```

Project-level:
```sql
SELECT COALESCE(SUM(te.hours_logged), 0)
FROM timesheet_entries te
JOIN subtasks s         ON s.id  = te.subtask_id
JOIN activity_groups ag ON ag.id = s.group_id
WHERE ag.project_id = :project_id
```

These are used in `reports.controller.js` (effort-variance) and optionally in `project.controller.js` detail views to display estimated vs actual.

---

## `estimated_hours` Display in Project / Task Detail

When Req 7.4 requires showing estimated vs actual on detail views, `project.controller.js` and `group.controller.js` are extended to include:

```sql
-- inline in getById queries
p.estimated_hours,
(SELECT COALESCE(SUM(te.hours_logged), 0)
 FROM timesheet_entries te
 JOIN subtasks s ON s.id = te.subtask_id
 JOIN activity_groups ag ON ag.id = s.group_id
 WHERE ag.project_id = p.id
) AS actual_hours_logged,
(
 COALESCE(
   (SELECT SUM(te.hours_logged) FROM timesheet_entries te JOIN subtasks s ON s.id = te.subtask_id JOIN activity_groups ag ON ag.id = s.group_id WHERE ag.project_id = p.id),
   0
 ) - COALESCE(p.estimated_hours, 0)
) AS variance
```

---

## File Structure — New Files

```
backend/src/
  controllers/
    timesheetEntries.controller.js   (new)
  models/
    timesheetEntries.model.js        (new)
  routers/
    timesheetEntries.routes.js       (new)
  migrations/
    001_analytics_timesheet_refactor.js  (new)
```

### Modified files

```
backend/server.js                          — register /api/timesheet-entries router
backend/src/routers/analytics.routes.js    — add requireRole("ADMIN","MASTER_ADMIN") to all routes; add /start-delay
backend/src/controllers/analytics.controller.js  — add startDelay handler; remove isMemberLevel soft filter (now handled by middleware)
backend/src/models/analytics.model.js      — feature-flag switch in summary/teamUtilisation/hoursPerPersonPerProject; add startDelayByUser
backend/src/models/subtask.model.js        — upsert task_assignments in update() when assignee_id changes
backend/src/models/project.model.js        — include estimated_hours in getById; compute actual_hours_logged + variance inline
backend/src/controllers/reports.controller.js  — add effortVariance, userEffort handlers; extend generate() for effort_variance type
backend/src/routers/reports.routes.js      — add GET /effort-variance, GET /user-effort routes with adminOnly
```

---

## Sequence Diagrams

### Timesheet Grid — Load

```
Browser → GET /api/timesheet-entries/grid?date_from=&date_to=
         ← 200 { projects: [ { tasks: [ { subtasks: [ { entries: [] } ] } ] } ] }
```

### Timesheet Grid — Create Entry

```
Browser → POST /api/timesheet-entries { subtask_id, date, hours_logged, billable_hours? }
  Controller:
    1. Validate fields
    2. Check task_assignments → 403 if missing
    3. Check daily total → 422 if hard limit exceeded
    4. INSERT timesheet_entries
         ← 201 { id, user_id, subtask_id, date, hours_logged, billable_hours, remarks, created_at }
    5. Catch ER_DUP_ENTRY → 409
```

### Subtask Assignment → task_assignments upsert

```
PATCH /api/subtasks/:id { assignee_id: 5 }
  subtask.model.update():
    1. UPDATE subtasks SET assignee_id = 5 WHERE id = X
    2. INSERT INTO task_assignments (user_id, subtask_id, assigned_date)
       VALUES (5, X, CURDATE())
       ON DUPLICATE KEY UPDATE assigned_date = assigned_date
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| `requireRole` middleware on analytics routes (not just controller-level filter) | Hard 403 before any data query runs; consistent with other admin-only routes like `/api/admin` |
| Feature flag checked in model, not controller | Keeps controllers thin; the flag is a data-source concern, not a business logic concern |
| `ON DUPLICATE KEY UPDATE assigned_date = assigned_date` | Preserves original assigned_date on re-assignment; no-op update avoids race conditions |
| Daily limit as env vars, not a new DB table | Avoids scope creep; a proper `org_settings` table is a natural follow-on feature |
| Effort aggregation inline in SQL, not a JS service | Matches existing codebase pattern; single round-trip; database computes aggregates correctly at scale |
| `timesheetEntries.routes.js` as a new router file | Keeps the new endpoint family isolated; follows the naming convention of every other router in the project |
| Grid endpoint returns nested JS-shaped object, not flat rows | Frontend can render the hierarchy directly without client-side re-grouping |
