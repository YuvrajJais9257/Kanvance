/**
 * add_autofill_columns.js
 *
 * Idempotent migration: adds five autofill/confirmation metadata columns to
 * the `timesheet_rows` table.  Each ALTER TABLE is guarded by an existence
 * check so the script is safe to run multiple times.
 *
 * Columns added:
 *   entry_source      ENUM('auto_generated','manual_override') NOT NULL DEFAULT 'auto_generated'
 *   source_task_ids   TEXT NULL
 *   last_auto_fill_at TIMESTAMP NULL
 *   last_confirmed_at TIMESTAMP NULL
 *   is_confirmed      BOOLEAN NOT NULL DEFAULT FALSE
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 *
 * Usage:
 *   node backend/src/migrations/add_autofill_columns.js
 */

"use strict";

const pool = require("../config/db");

/**
 * Returns true when `columnName` already exists on `tableName` in the
 * current database.  Uses INFORMATION_SCHEMA so it works on any MySQL/MariaDB
 * version without needing DDL privileges beyond SELECT.
 *
 * @param {import("mysql2/promise").Pool} conn
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
 * Runs the migration.  Each column is added only when it does not already
 * exist, making the migration fully idempotent.
 */
async function migrate() {
  const TABLE = "timesheet_rows";

  // Definitions for each new column: [columnName, DDL fragment]
  const columns = [
    [
      "entry_source",
      "ADD COLUMN entry_source ENUM('auto_generated', 'manual_override') NOT NULL DEFAULT 'auto_generated'",
    ],
    [
      "source_task_ids",
      "ADD COLUMN source_task_ids TEXT NULL",
    ],
    [
      "last_auto_fill_at",
      "ADD COLUMN last_auto_fill_at TIMESTAMP NULL",
    ],
    [
      "last_confirmed_at",
      "ADD COLUMN last_confirmed_at TIMESTAMP NULL",
    ],
    [
      "is_confirmed",
      "ADD COLUMN is_confirmed BOOLEAN NOT NULL DEFAULT FALSE",
    ],
  ];

  for (const [columnName, ddl] of columns) {
    const exists = await columnExists(pool, TABLE, columnName);
    if (exists) {
      console.log(`  [skip]  Column '${columnName}' already exists on '${TABLE}'.`);
    } else {
      await pool.execute(`ALTER TABLE ${TABLE} ${ddl}`);
      console.log(`  [added] Column '${columnName}' added to '${TABLE}'.`);
    }
  }

  console.log("\nMigration complete.");
}

migrate()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
  });
