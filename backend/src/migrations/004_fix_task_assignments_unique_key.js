/**
 * 004_fix_task_assignments_unique_key.js
 *
 * Fixes the unique key on task_assignments so the soft-delete pattern works.
 *
 * Problem:
 *   Migration 001 created task_assignments with:
 *     UNIQUE KEY uq_user_subtask (user_id, subtask_id)
 *
 *   Migration 002 added unassigned_date (soft-delete column) but did NOT
 *   update the unique key. This means only one row per (user_id, subtask_id)
 *   is allowed regardless of unassigned_date — so re-assigning a previously
 *   soft-unassigned user throws:
 *     Duplicate entry '1-1213' for key 'task_assignments.uq_user_subtask'
 *
 * Fix:
 *   Drop the old unique key and replace it with a partial unique index that
 *   only covers ACTIVE assignments (unassigned_date IS NULL).
 *
 *   MySQL does not support partial (filtered) indexes, so we use a standard
 *   composite key on (user_id, subtask_id, unassigned_date) instead.
 *   Since unassigned_date IS NULL for active rows and NULL != NULL in MySQL
 *   unique index evaluation, multiple soft-deleted rows for the same
 *   (user_id, subtask_id) are allowed, and only one active (NULL) row is
 *   enforced per pair.
 *
 * Idempotent: checks for the old key before dropping, checks for the new
 *   key before adding.
 *
 * Usage:
 *   node backend/src/migrations/004_fix_task_assignments_unique_key.js
 *   node backend/src/migrations/004_fix_task_assignments_unique_key.js --dry-run
 */

"use strict";

const pool = require("../config/db");

const DRY_RUN = process.argv.includes("--dry-run");

async function indexExists(conn, tableName, keyName) {
  const [rows] = await conn.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND INDEX_NAME   = ?
     LIMIT 1`,
    [tableName, keyName]
  );
  return rows.length > 0;
}

async function exec(conn, sql, label) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${label}`);
    console.log(`          ${sql.replace(/\s+/g, " ").trim()}\n`);
    return;
  }
  await conn.execute(sql);
  console.log(`  [done]  ${label}`);
}

async function migrate() {
  if (DRY_RUN) {
    console.log("=== DRY-RUN MODE — no changes will be written ===\n");
  }

  const conn = await pool.getConnection();
  let currentStatement = "(none)";

  try {
    if (!DRY_RUN) {
      await conn.beginTransaction();
      console.log("[info]  Transaction started.");
    }

    // Step 1: Drop FKs that reference columns in the unique key (MySQL requires
    // this before the index can be dropped or replaced).
    // fk_ta_user  → user_id    (part of uq_user_subtask)
    // fk_ta_subtask → subtask_id (part of uq_user_subtask)
    for (const fk of ["fk_ta_user", "fk_ta_subtask"]) {
      currentStatement = `DROP FOREIGN KEY ${fk}`;
      const [[fkRow]] = await conn.execute(
        `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments'
           AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        [fk]
      );
      if (!fkRow) {
        console.log(`  [skip]  FK '${fk}' not found.`);
      } else {
        await exec(conn, `ALTER TABLE task_assignments DROP FOREIGN KEY ${fk}`, `Drop FK ${fk}`);
      }
    }

    // Step 2: Drop the old narrow unique key (user_id, subtask_id)
    currentStatement = "DROP INDEX uq_user_subtask";
    {
      const exists = await indexExists(conn, "task_assignments", "uq_user_subtask");
      if (!exists) {
        console.log("  [skip]  Index 'uq_user_subtask' not found — already replaced.");
      } else {
        await exec(
          conn,
          `ALTER TABLE task_assignments DROP INDEX uq_user_subtask`,
          "Drop old UNIQUE KEY uq_user_subtask (user_id, subtask_id)"
        );
      }
    }

    // Step 3: Add the new composite key (user_id, subtask_id, unassigned_date).
    // NULL != NULL in MySQL unique index evaluation, so multiple soft-deleted
    // rows are allowed but only one active (NULL unassigned_date) row per pair.
    currentStatement = "ADD UNIQUE KEY uq_active_assignment";
    {
      const exists = await indexExists(conn, "task_assignments", "uq_active_assignment");
      if (exists) {
        console.log("  [skip]  Index 'uq_active_assignment' already exists.");
      } else {
        await exec(
          conn,
          `ALTER TABLE task_assignments
           ADD UNIQUE KEY uq_active_assignment (user_id, subtask_id, unassigned_date)`,
          "Add UNIQUE KEY uq_active_assignment (user_id, subtask_id, unassigned_date)"
        );
      }
    }

    // Step 4: Re-add the FK constraints that were dropped in step 1.
    currentStatement = "Re-add fk_ta_user";
    {
      const [[fkRow]] = await conn.execute(
        `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments'
           AND CONSTRAINT_NAME = 'fk_ta_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        []
      );
      if (fkRow) {
        console.log("  [skip]  FK 'fk_ta_user' already exists.");
      } else {
        await exec(
          conn,
          `ALTER TABLE task_assignments
           ADD CONSTRAINT fk_ta_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
          "Re-add FK fk_ta_user"
        );
      }
    }

    currentStatement = "Re-add fk_ta_subtask";
    {
      const [[fkRow]] = await conn.execute(
        `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments'
           AND CONSTRAINT_NAME = 'fk_ta_subtask' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        []
      );
      if (fkRow) {
        console.log("  [skip]  FK 'fk_ta_subtask' already exists.");
      } else {
        await exec(
          conn,
          `ALTER TABLE task_assignments
           ADD CONSTRAINT fk_ta_subtask FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE`,
          "Re-add FK fk_ta_subtask"
        );
      }
    }

    if (!DRY_RUN) {
      await conn.commit();
      console.log("[info]  Transaction committed.");
    }

    console.log("\n✓ Migration 004 complete.");
  } catch (err) {
    if (!DRY_RUN) {
      try { await conn.rollback(); console.error("[info]  Rolled back."); }
      catch (re) { console.error("[warn]  Rollback failed:", re.message); }
    }
    const enhanced = new Error(
      `Migration 004 failed at: "${currentStatement}" — ${err.message}`
    );
    enhanced.originalError = err;
    throw enhanced;
  } finally {
    conn.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nMigration error:", err.message);
    process.exit(1);
  });
