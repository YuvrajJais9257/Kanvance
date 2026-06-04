/**
 * 003_timesheet_entries_refactor.js
 *
 * Refactor timesheet_entries table:
 *   - Remove billable_hours DECIMAL(5,2) column
 *   - Add time_type ENUM column with values:
 *     'Billable', 'Non-billable', 'Overtime', 'Holidays', 'Sick Time', 'Training', 'Vacation'
 *
 * Idempotent: safe to run multiple times.
 *   - DROP COLUMN is guarded by INFORMATION_SCHEMA check
 *   - ADD COLUMN is guarded by INFORMATION_SCHEMA check
 *
 * CLI flags:
 *   --dry-run       Print all SQL to stdout; write nothing to the database.
 *
 * Usage:
 *   node backend/src/migrations/003_timesheet_entries_refactor.js
 *   node backend/src/migrations/003_timesheet_entries_refactor.js --dry-run
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
 * Check if a column exists via INFORMATION_SCHEMA
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
 * Execute SQL either live or as dry-run
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

(async () => {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log("Starting timesheet_entries refactor migration...\n");

    if (!DRY_RUN) {
      await conn.beginTransaction();
    }

    // Step 1: Remove billable_hours column if it exists
    const hasBillableHours = await columnExists(
      conn,
      "timesheet_entries",
      "billable_hours",
    );
    if (hasBillableHours) {
      await exec(
        conn,
        `ALTER TABLE timesheet_entries DROP COLUMN billable_hours`,
        "Remove billable_hours column from timesheet_entries",
      );
    } else {
      console.log(
        "  [skip]  billable_hours column does not exist (already removed)\n",
      );
    }

    // Step 2: Add time_type column if it doesn't exist
    const hasTimeType = await columnExists(
      conn,
      "timesheet_entries",
      "time_type",
    );
    if (!hasTimeType) {
      await exec(
        conn,
        `ALTER TABLE timesheet_entries
         ADD COLUMN time_type ENUM('Billable', 'Non-billable', 'Overtime', 'Holidays', 'Sick Time', 'Training', 'Vacation')
         NOT NULL DEFAULT 'Billable'`,
        "Add time_type ENUM column to timesheet_entries",
      );
    } else {
      console.log("  [skip]  time_type column already exists\n");
    }

    if (!DRY_RUN) {
      await conn.commit();
    }

    console.log("✓ Migration completed successfully");
    process.exit(0);
  } catch (err) {
    if (conn && !DRY_RUN) {
      await conn.rollback();
    }
    console.error("✗ Migration failed:", err.message);
    console.error("Failed statement:", err.sql || "unknown");
    process.exit(1);
  } finally {
    if (conn) conn.release();
  }
})();
