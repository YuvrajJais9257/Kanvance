/**
 * 001_analytics_timesheet_refactor.js
 *
 * Idempotent, transactional migration for the Analytics Dashboard Refactor,
 * Timesheet Module Overhaul, and Reporting System Enhancement.
 *
 * Changes applied:
 *   1. ADD COLUMN estimated_hours DECIMAL(8,2) DEFAULT NULL → projects
 *   2. ADD COLUMN estimated_hours DECIMAL(8,2) DEFAULT NULL → activity_groups
 *   3. ADD COLUMN estimated_hours DECIMAL(8,2) DEFAULT NULL → subtasks
 *   4. CREATE TABLE IF NOT EXISTS task_assignments
 *   5. CREATE TABLE IF NOT EXISTS timesheet_entries
 *
 * Safety guarantees:
 *   - Every ALTER TABLE is guarded by an INFORMATION_SCHEMA.COLUMNS existence check.
 *   - Every CREATE TABLE uses IF NOT EXISTS.
 *   - All DDL runs inside a single BEGIN / COMMIT transaction; any failure
 *     triggers an automatic ROLLBACK and rethrows the error with the
 *     offending statement identified.
 *
 * CLI flags:
 *   --dry-run       Print all SQL to stdout; write nothing to the database.
 *   --migrate-data  After the DDL step, migrate rows from time_logs and
 *                   activity_logs into timesheet_entries.  Can be combined
 *                   with --dry-run to preview planned INSERTs without writing.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8,
 *               15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 *
 * Usage:
 *   node backend/src/migrations/001_analytics_timesheet_refactor.js
 *   node backend/src/migrations/001_analytics_timesheet_refactor.js --dry-run
 *   node backend/src/migrations/001_analytics_timesheet_refactor.js --migrate-data
 *   node backend/src/migrations/001_analytics_timesheet_refactor.js --migrate-data --dry-run
 */

"use strict";

const path = require("path");
const fs = require("fs");
const pool = require("../config/db");

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes("--dry-run");
const MIGRATE_DATA = process.argv.includes("--migrate-data");

// ---------------------------------------------------------------------------
// Error-log path (written alongside the script, in the cwd)
// ---------------------------------------------------------------------------
const ERROR_LOG_PATH = path.join(process.cwd(), "migration_errors.log");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `columnName` already exists on `tableName` in the
 * current database, checked via INFORMATION_SCHEMA.
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} tableName
 * @param {string} columnName
 * @returns {Promise<boolean>}
 */
async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND COLUMN_NAME  = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

/**
 * Either executes `sql` on `conn` (live mode) or logs it to stdout (dry-run).
 * Returns a description string for logging.
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} sql
 * @param {string} label   Human-readable description for logging
 */
async function exec(conn, sql, label) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${label}`);
    console.log(`          ${sql.replace(/\s+/g, " ").trim()}\n`);
    return;
  }
  await conn.execute(sql);
  console.log(`  [done]  ${label}`);
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Runs all DDL steps inside a single transaction.
 * On failure, rolls back and rethrows with the offending statement identified.
 */
async function migrate() {
  if (DRY_RUN) {
    console.log(
      "=== DRY-RUN MODE — no changes will be written to the database ===\n",
    );
  }

  // Obtain a dedicated connection so BEGIN/COMMIT are scoped correctly.
  const conn = await pool.getConnection();
  let currentStatement = "unknown";

  try {
    // ------------------------------------------------------------------
    // 1. Open transaction
    // ------------------------------------------------------------------
    if (!DRY_RUN) {
      await conn.beginTransaction();
      console.log("[info]  Transaction started.");
    }

    // ------------------------------------------------------------------
    // 2. Add estimated_hours to projects (Req 12.1, 12.6)
    // ------------------------------------------------------------------
    currentStatement = "ALTER TABLE projects ADD COLUMN estimated_hours";
    {
      const exists = await columnExists(conn, "projects", "estimated_hours");
      if (exists) {
        console.log(
          "  [skip]  Column 'estimated_hours' already exists on 'projects'.",
        );
      } else {
        const sql = `ALTER TABLE projects
                     ADD COLUMN estimated_hours DECIMAL(8,2) DEFAULT NULL`;
        await exec(conn, sql, "Add estimated_hours to projects");
      }
    }

    // ------------------------------------------------------------------
    // 3. Add estimated_hours to activity_groups (Req 12.2, 12.6)
    // ------------------------------------------------------------------
    currentStatement = "ALTER TABLE activity_groups ADD COLUMN estimated_hours";
    {
      const exists = await columnExists(
        conn,
        "activity_groups",
        "estimated_hours",
      );
      if (exists) {
        console.log(
          "  [skip]  Column 'estimated_hours' already exists on 'activity_groups'.",
        );
      } else {
        const sql = `ALTER TABLE activity_groups
                     ADD COLUMN estimated_hours DECIMAL(8,2) DEFAULT NULL`;
        await exec(conn, sql, "Add estimated_hours to activity_groups");
      }
    }

    // ------------------------------------------------------------------
    // 4. Add estimated_hours to subtasks (Req 12.3, 12.6)
    // ------------------------------------------------------------------
    currentStatement = "ALTER TABLE subtasks ADD COLUMN estimated_hours";
    {
      const exists = await columnExists(conn, "subtasks", "estimated_hours");
      if (exists) {
        console.log(
          "  [skip]  Column 'estimated_hours' already exists on 'subtasks'.",
        );
      } else {
        const sql = `ALTER TABLE subtasks
                     ADD COLUMN estimated_hours DECIMAL(8,2) DEFAULT NULL`;
        await exec(conn, sql, "Add estimated_hours to subtasks");
      }
    }

    // ------------------------------------------------------------------
    // 5. Create task_assignments (Req 12.4, 12.6)
    // ------------------------------------------------------------------
    currentStatement = "CREATE TABLE IF NOT EXISTS task_assignments";
    {
      const sql = `CREATE TABLE IF NOT EXISTS task_assignments (
        id            INT          AUTO_INCREMENT PRIMARY KEY,
        user_id       BIGINT       NOT NULL,
        subtask_id    BIGINT       NOT NULL,
        assigned_date DATE         NOT NULL,
        UNIQUE KEY uq_user_subtask (user_id, subtask_id),
        CONSTRAINT fk_ta_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
        CONSTRAINT fk_ta_subtask FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE
      )`;
      await exec(conn, sql, "CREATE TABLE IF NOT EXISTS task_assignments");
    }

    // ------------------------------------------------------------------
    // 6. Create timesheet_entries (Req 12.5, 12.6)
    // ------------------------------------------------------------------
    currentStatement = "CREATE TABLE IF NOT EXISTS timesheet_entries";
    {
      const sql = `CREATE TABLE IF NOT EXISTS timesheet_entries (
        id             INT          AUTO_INCREMENT PRIMARY KEY,
        user_id        BIGINT       NOT NULL,
        subtask_id     BIGINT       NOT NULL,
        date           DATE         NOT NULL,
        hours_logged   DECIMAL(5,2) NOT NULL
                         CHECK (hours_logged  >= 0.01 AND hours_logged  <= 999.99),
        billable_hours DECIMAL(5,2) NOT NULL DEFAULT 0
                         CHECK (billable_hours >= 0),
        remarks        TEXT         DEFAULT NULL,
        created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_entry (user_id, subtask_id, date),
        CONSTRAINT fk_te_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
        CONSTRAINT fk_te_subtask FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE
      )`;
      await exec(conn, sql, "CREATE TABLE IF NOT EXISTS timesheet_entries");
    }

    // ------------------------------------------------------------------
    // 7. Commit (Req 12.8)
    // ------------------------------------------------------------------
    if (!DRY_RUN) {
      await conn.commit();
      console.log("[info]  Transaction committed.");
    }

    console.log("\nMigration complete.");
  } catch (err) {
    // ------------------------------------------------------------------
    // 8. Rollback on any failure (Req 12.7, 12.8)
    // ------------------------------------------------------------------
    if (!DRY_RUN) {
      try {
        await conn.rollback();
        console.error("[info]  Transaction rolled back.");
      } catch (rollbackErr) {
        console.error("[warn]  Rollback failed:", rollbackErr.message);
      }
    }

    // Rethrow with the failing statement identified (Req 12.7)
    const enhanced = new Error(
      `Migration failed at statement: "${currentStatement}" — ${err.message}`,
    );
    enhanced.originalError = err;
    throw enhanced;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Data Migration  (--migrate-data)
// ---------------------------------------------------------------------------

/**
 * Normalise a string for case-insensitive, whitespace-trimmed comparison.
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalise(value) {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Append one error entry to migration_errors.log (line-delimited JSON).
 * In dry-run mode the file is never written.
 *
 * @param {object} row    The full source row
 * @param {string} reason "no_match" | "ambiguous_match"
 */
function logError(row, reason) {
  const entry = JSON.stringify({ reason, row });
  if (DRY_RUN) {
    console.log(`[dry-run] [error-log] ${entry}`);
    return;
  }
  fs.appendFileSync(ERROR_LOG_PATH, entry + "\n", "utf8");
}

/**
 * Attempt to insert a single row into timesheet_entries.
 * Returns "inserted" | "deduped" | "dry_run".
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ user_id: number, subtask_id: number, date: string,
 *           hours_logged: number, billable_hours: number,
 *           remarks: string|null }} entry
 * @returns {Promise<"inserted"|"deduped"|"dry_run">}
 */
async function insertEntry(conn, entry) {
  const sql = `INSERT IGNORE INTO timesheet_entries
                 (user_id, subtask_id, date, hours_logged, billable_hours, remarks)
               VALUES (?, ?, ?, ?, ?, ?)`;
  const params = [
    entry.user_id,
    entry.subtask_id,
    entry.date,
    entry.hours_logged,
    entry.billable_hours,
    entry.remarks ?? null,
  ];

  if (DRY_RUN) {
    const preview = `INSERT IGNORE INTO timesheet_entries (user_id, subtask_id, date, hours_logged, billable_hours, remarks) VALUES (${params.map((p) => JSON.stringify(p)).join(", ")})`;
    console.log(`[dry-run] ${preview}`);
    return "dry_run";
  }

  const [result] = await conn.execute(sql, params);
  // INSERT IGNORE: affectedRows = 1 → inserted, 0 → duplicate skipped
  return result.affectedRows > 0 ? "inserted" : "deduped";
}

/**
 * Migrate time_logs → timesheet_entries.
 *
 * Resolution logic (Req 15.1):
 *   - Normalise activity_group → match against activity_groups.name (case-insensitive trim)
 *   - Normalise subtask_name   → match against subtasks.name within that group (case-insensitive trim)
 *   - No match or ambiguous → log to error file, skip row (Req 15.2)
 *   - billable_hours = 0.00 for all migrated rows (Req 15.3)
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @returns {Promise<{inserted: number, deduped: number, errors: number}>}
 */
async function migrateTimeLogs(conn) {
  console.log("\n[migrate-data] Processing time_logs → timesheet_entries …");

  // Load all activity_groups (id, name, normalised name)
  const [groups] = await conn.execute(`SELECT id, name FROM activity_groups`);
  /** @type {Map<string, number[]>}  normalised_name → [group_id, ...] */
  const groupsByName = new Map();
  for (const g of groups) {
    const key = normalise(g.name);
    if (!groupsByName.has(key)) groupsByName.set(key, []);
    groupsByName.get(key).push(g.id);
  }

  // Load all subtasks (id, name, group_id, normalised name)
  const [subtaskRows] = await conn.execute(
    `SELECT id, name, group_id FROM subtasks`,
  );
  /**
   * @type {Map<number, Map<string, number[]>>}
   *   group_id → normalised_subtask_name → [subtask_id, ...]
   */
  const subtasksByGroup = new Map();
  for (const s of subtaskRows) {
    if (!subtasksByGroup.has(s.group_id))
      subtasksByGroup.set(s.group_id, new Map());
    const byName = subtasksByGroup.get(s.group_id);
    const key = normalise(s.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(s.id);
  }

  // Fetch all time_logs rows
  const [timeLogs] = await conn.execute(
    `SELECT id, employee_id, project_name, activity_group, subtask_name, date, hours
     FROM time_logs`,
  );

  let inserted = 0;
  let deduped = 0;
  let errors = 0;

  for (const row of timeLogs) {
    const groupKey = normalise(row.activity_group);
    const groupIds = groupsByName.get(groupKey) ?? [];

    if (groupIds.length === 0) {
      logError(row, "no_match");
      errors++;
      continue;
    }

    // Collect all matching subtask IDs across matching groups
    const subtaskKey = normalise(row.subtask_name);
    const matchedSubIds = [];

    for (const gid of groupIds) {
      const byName = subtasksByGroup.get(gid);
      if (!byName) continue;
      const subIds = byName.get(subtaskKey) ?? [];
      matchedSubIds.push(...subIds);
    }

    if (matchedSubIds.length === 0) {
      logError(row, "no_match");
      errors++;
      continue;
    }

    if (matchedSubIds.length > 1) {
      logError(row, "ambiguous_match");
      errors++;
      continue;
    }

    // Single unambiguous match
    const subtask_id = matchedSubIds[0];
    const outcome = await insertEntry(conn, {
      user_id: row.employee_id,
      subtask_id,
      date:
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date),
      hours_logged: row.hours,
      billable_hours: 0.0,
      remarks: null,
    });

    if (outcome === "inserted") inserted++;
    else if (outcome === "deduped") deduped++;
    // dry_run counted separately in summary
  }

  return { inserted, deduped, errors };
}

/**
 * Migrate activity_logs → timesheet_entries.
 *
 * activity_logs already carries a subtask_id FK — no string resolution needed
 * (Req 15.4).  Rows without a subtask_id are skipped (logged as no_match).
 * billable_hours = 0.00, remarks = NULL for all rows.
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @returns {Promise<{inserted: number, deduped: number, errors: number}>}
 */
async function migrateActivityLogs(conn) {
  console.log("[migrate-data] Processing activity_logs → timesheet_entries …");

  const [activityLogs] = await conn.execute(
    `SELECT id, user_id, subtask_id, logged_date AS date, hours
     FROM activity_logs
     WHERE user_id IS NOT NULL AND subtask_id IS NOT NULL`,
  );

  // Rows without user_id or subtask_id — log them as no_match
  const [nullRows] = await conn.execute(
    `SELECT id, user_id, subtask_id, logged_date AS date, hours
     FROM activity_logs
     WHERE user_id IS NULL OR subtask_id IS NULL`,
  );

  let inserted = 0;
  let deduped = 0;
  let errors = nullRows.length;

  for (const row of nullRows) {
    logError({ source: "activity_logs", ...row }, "no_match");
  }

  for (const row of activityLogs) {
    const outcome = await insertEntry(conn, {
      user_id: row.user_id,
      subtask_id: row.subtask_id,
      date:
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date),
      hours_logged: row.hours,
      billable_hours: 0.0,
      remarks: null,
    });

    if (outcome === "inserted") inserted++;
    else if (outcome === "deduped") deduped++;
  }

  return { inserted, deduped, errors };
}

/**
 * Orchestrates the full data migration (--migrate-data flag).
 * Runs OUTSIDE the DDL transaction so the schema is committed first.
 * Each source table is migrated independently; errors are written to
 * migration_errors.log (Req 15.2) and never abort the run.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */
async function migrateData() {
  if (DRY_RUN) {
    console.log("\n=== DRY-RUN DATA MIGRATION — no rows will be written ===\n");
  } else {
    console.log("\n=== DATA MIGRATION START ===\n");
  }

  const conn = await pool.getConnection();

  try {
    const tl = await migrateTimeLogs(conn);
    const al = await migrateActivityLogs(conn);

    // -----------------------------------------------------------------------
    // Summary (Req 15.5 / 15.6)
    // -----------------------------------------------------------------------
    const totalInserted = tl.inserted + al.inserted;
    const totalDeduped = tl.deduped + al.deduped;
    const totalErrors = tl.errors + al.errors;

    console.log("\n──────────────────────────────────────────");
    console.log("  DATA MIGRATION SUMMARY");
    console.log("──────────────────────────────────────────");
    if (DRY_RUN) {
      console.log("  Mode              : DRY-RUN (no rows written)");
    }
    console.log(`  time_logs`);
    console.log(`    rows inserted   : ${DRY_RUN ? "(dry-run)" : tl.inserted}`);
    console.log(`    rows deduped    : ${tl.deduped}`);
    console.log(`    rows errored    : ${tl.errors}`);
    console.log(`  activity_logs`);
    console.log(`    rows inserted   : ${DRY_RUN ? "(dry-run)" : al.inserted}`);
    console.log(`    rows deduped    : ${al.deduped}`);
    console.log(`    rows errored    : ${al.errors}`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(
      `  TOTAL inserted    : ${DRY_RUN ? "(dry-run)" : totalInserted}`,
    );
    console.log(`  TOTAL deduped     : ${totalDeduped}`);
    console.log(`  TOTAL errors      : ${totalErrors}`);
    if (!DRY_RUN && totalErrors > 0) {
      console.log(`  Error log         : ${ERROR_LOG_PATH}`);
    }
    console.log("──────────────────────────────────────────\n");
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
migrate()
  .then(async () => {
    if (MIGRATE_DATA) {
      await migrateData();
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nMigration error:", err.message);
    process.exit(1);
  });
