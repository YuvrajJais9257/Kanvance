/**
 * timeLog.model.js
 *
 * CRUD + upsert helpers for the time_logs table.
 *
 * Natural key: (employee_id, project_name, activity_group, date)
 * Excel uploads use upsert — they always overwrite matching rows.
 * App auto-logs use insert-if-not-exists — they never overwrite.
 */
const pool = require("../config/db");

/**
 * Insert a single app-sourced log entry (subtask marked Done).
 * Skips silently if an entry already exists for the same natural key.
 *
 * @param {object} entry
 * @param {number} entry.employee_id
 * @param {string} entry.project_name
 * @param {string} entry.activity_group
 * @param {string} entry.date          — YYYY-MM-DD
 * @param {number} entry.hours
 * @returns {Promise<{inserted: boolean}>}
 */
exports.insertAppLog = async ({ employee_id, project_name, activity_group, date, hours }) => {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO time_logs
       (employee_id, project_name, activity_group, date, hours, source)
     VALUES (?, ?, ?, ?, ?, 'app')`,
    [employee_id, project_name ?? "", activity_group ?? "", date, hours]
  );
  return { inserted: result.affectedRows > 0 };
};

/**
 * Upsert a batch of Excel-sourced rows.
 * On duplicate natural key: overwrite hours + source.
 *
 * @param {Array<{employee_id, project_name, activity_group, date, hours}>} rows
 * @returns {Promise<{inserted: number, updated: number}>}
 */
exports.upsertExcelBatch = async (rows) => {
  if (!rows.length) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated  = 0;

  for (const row of rows) {
    const [result] = await pool.execute(
      `INSERT INTO time_logs
         (employee_id, project_name, activity_group, date, hours, source)
       VALUES (?, ?, ?, ?, ?, 'excel')
       ON DUPLICATE KEY UPDATE
         hours      = VALUES(hours),
         source     = 'excel',
         updated_at = CURRENT_TIMESTAMP`,
      [row.employee_id, row.project_name ?? "", row.activity_group ?? "", row.date, row.hours]
    );
    // affectedRows = 1 → insert, 2 → update, 0 → no change (same value)
    if (result.affectedRows === 1) inserted++;
    else if (result.affectedRows >= 2) updated++;
  }

  return { inserted, updated };
};

/**
 * Preview conflicts for a batch of Excel rows before committing.
 * Returns per-row conflict info: whether an existing entry exists and its source.
 *
 * @param {Array<{employee_id, project_name, activity_group, date}>} rows
 * @returns {Promise<Map<string, {existing_hours, existing_source}>>}
 *   Key is `${employee_id}|${project_name}|${activity_group}|${date}`
 */
exports.findConflicts = async (rows) => {
  if (!rows.length) return new Map();

  // Build a single query with OR conditions for efficiency
  const conditions = rows.map(() =>
    "(employee_id = ? AND project_name = ? AND activity_group = ? AND date = ?)"
  ).join(" OR ");

  const params = rows.flatMap((r) => [
    r.employee_id,
    r.project_name ?? "",
    r.activity_group ?? "",
    r.date,
  ]);

  const [existing] = await pool.execute(
    `SELECT employee_id, project_name, activity_group, date, hours AS existing_hours, source AS existing_source
     FROM time_logs
     WHERE ${conditions}`,
    params
  );

  const map = new Map();
  for (const row of existing) {
    const key = `${row.employee_id}|${row.project_name}|${row.activity_group}|${row.date}`;
    map.set(key, { existing_hours: row.existing_hours, existing_source: row.existing_source });
  }
  return map;
};

/**
 * Sum total hours per employee from time_logs.
 * Used by Analytics → Team Utilisation.
 *
 * @returns {Promise<Array<{employee_id, total_hours}>>}
 */
exports.totalHoursByEmployee = async () => {
  const [rows] = await pool.execute(
    `SELECT employee_id, ROUND(SUM(hours), 1) AS total_hours
     FROM time_logs
     GROUP BY employee_id`
  );
  return rows;
};
