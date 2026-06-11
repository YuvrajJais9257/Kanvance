/**
 * 002_assignment_membership_architecture.js
 *
 * Idempotent, transactional migration for the Assignment and Project Membership
 * Architecture feature.
 *
 * Changes applied:
 *   1. CREATE TABLE IF NOT EXISTS project_members
 *   2. ADD COLUMN activity_groups.assignee_id (with ON DELETE SET NULL FK)
 *   3. ADD COLUMN task_assignments.unassigned_date
 *   4. ADD COLUMN task_assignments.inherited_from_task_id (with ON DELETE SET NULL FK)
 *
 * Safety guarantees:
 *   - Every CREATE TABLE uses IF NOT EXISTS.
 *   - Every ALTER TABLE is guarded by an INFORMATION_SCHEMA.COLUMNS existence check.
 *   - All DDL runs inside a single BEGIN / COMMIT transaction; any failure
 *     triggers an automatic ROLLBACK, prints the offending statement, and
 *     exits with a non-zero code.
 *
 * Requirements: 1.1–1.5, 12.1–12.8
 *
 * Usage:
 *   node backend/src/migrations/002_assignment_membership_architecture.js
 *   node backend/src/migrations/002_assignment_membership_architecture.js --dry-run
 */

"use strict";

const pool = require("../config/db");

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes("--dry-run");

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
    [tableName, columnName]
  );
  return rows.length > 0;
}

/**
 * Either executes `sql` on `conn` (live mode) or prints it to stdout (dry-run).
 * Logs the statement (or dry-run preview) to stdout before executing.
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} sql
 * @param {string} label   Human-readable description for logging
 */
async function exec(conn, sql, label) {
  const preview = sql.replace(/\s+/g, " ").trim();
  if (DRY_RUN) {
    console.log(`[dry-run] ${label}`);
    console.log(`          ${preview}\n`);
    return;
  }
  console.log(`[exec]    ${label}`);
  console.log(`          ${preview}`);
  await conn.execute(sql);
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
    console.log("=== DRY-RUN MODE — no changes will be written to the database ===\n");
  }

  // Obtain a dedicated connection so BEGIN/COMMIT are scoped correctly.
  const conn = await pool.getConnection();

  // Track the current statement for error reporting (Req 1.5, 12.7)
  let currentStatement = "(none)";

  try {
    // ------------------------------------------------------------------
    // 1. Open transaction (Req 12.6)
    // ------------------------------------------------------------------
    if (!DRY_RUN) {
      await conn.beginTransaction();
      console.log("[info]    Transaction started.\n");
    }

    // ------------------------------------------------------------------
    // 2. CREATE TABLE project_members (Req 1.1, 12.1)
    // ------------------------------------------------------------------
    currentStatement = "CREATE TABLE IF NOT EXISTS project_members";
    {
      const sql = `CREATE TABLE IF NOT EXISTS project_members (
  id          BIGINT      AUTO_INCREMENT PRIMARY KEY,
  project_id  BIGINT      NOT NULL,
  user_id     BIGINT      NOT NULL,
  joined_date DATE        NOT NULL,
  left_date   DATE        DEFAULT NULL,
  role        VARCHAR(50) NOT NULL DEFAULT 'member',
  UNIQUE KEY uq_project_user (project_id, user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
)`;
      await exec(conn, sql, "CREATE TABLE IF NOT EXISTS project_members");
    }

    // ------------------------------------------------------------------
    // 3. Add activity_groups.assignee_id (Req 1.2, 12.2, 12.3)
    // ------------------------------------------------------------------
    currentStatement = "ALTER TABLE activity_groups ADD COLUMN assignee_id";
    {
      const exists = await columnExists(conn, "activity_groups", "assignee_id");
      if (exists) {
        console.log("[skip]    Column 'assignee_id' already exists on 'activity_groups'.\n");
      } else {
        const sql = `ALTER TABLE activity_groups
  ADD COLUMN assignee_id BIGINT DEFAULT NULL,
  ADD CONSTRAINT fk_ag_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL`;
        await exec(conn, sql, "ALTER TABLE activity_groups ADD COLUMN assignee_id + FK");
      }
    }

    // ------------------------------------------------------------------
    // 4. Add task_assignments.unassigned_date (Req 1.3, 12.4, 12.5)
    // ------------------------------------------------------------------
    currentStatement = "ALTER TABLE task_assignments ADD COLUMN unassigned_date";
    {
      const exists = await columnExists(conn, "task_assignments", "unassigned_date");
      if (exists) {
        console.log("[skip]    Column 'unassigned_date' already exists on 'task_assignments'.\n");
      } else {
        const sql = `ALTER TABLE task_assignments
  ADD COLUMN unassigned_date DATE DEFAULT NULL`;
        await exec(conn, sql, "ALTER TABLE task_assignments ADD COLUMN unassigned_date");
      }
    }

    // ------------------------------------------------------------------
    // 5. Add task_assignments.inherited_from_task_id (Req 4.2, design schema)
    // ------------------------------------------------------------------
    currentStatement = "ALTER TABLE task_assignments ADD COLUMN inherited_from_task_id";
    {
      const exists = await columnExists(conn, "task_assignments", "inherited_from_task_id");
      if (exists) {
        console.log("[skip]    Column 'inherited_from_task_id' already exists on 'task_assignments'.\n");
      } else {
        const sql = `ALTER TABLE task_assignments
  ADD COLUMN inherited_from_task_id BIGINT DEFAULT NULL,
  ADD CONSTRAINT fk_ta_inherited FOREIGN KEY (inherited_from_task_id) REFERENCES activity_groups(id) ON DELETE SET NULL`;
        await exec(conn, sql, "ALTER TABLE task_assignments ADD COLUMN inherited_from_task_id + FK");
      }
    }

    // ------------------------------------------------------------------
    // 6. Commit (Req 12.6)
    // ------------------------------------------------------------------
    if (!DRY_RUN) {
      await conn.commit();
      console.log("\n[info]    Transaction committed.");
    }

    console.log("\nMigration complete.");
  } catch (err) {
    // ------------------------------------------------------------------
    // 7. Rollback on any failure (Req 1.5, 12.6, 12.7)
    // ------------------------------------------------------------------
    if (!DRY_RUN) {
      try {
        await conn.rollback();
        console.error("[info]    Transaction rolled back.");
      } catch (rollbackErr) {
        console.error("[warn]    Rollback failed:", rollbackErr.message);
      }
    }

    // Rethrow with the failing statement identified (Req 1.5, 12.7)
    const enhanced = new Error(
      `Migration failed at statement: "${currentStatement}" — ${err.message}`
    );
    enhanced.originalError = err;
    throw enhanced;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
migrate()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nMigration error:", err.message);
    process.exit(1);
  });
