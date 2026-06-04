'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Appends a structured JSON RunLogEntry to the configured log file.
 *
 * In dry-run mode every serialised entry is prefixed with "[DRY RUN] ".
 *
 * @typedef {object} Warning
 * @property {'orphan_subtask'|'fuzzy_match'|'confirmed_skip'|'after_hours'|'truncation'|'future_closed_at'} type
 * @property {string} detail
 *
 * @typedef {object} RunLogEntry
 * @property {string}  timestamp    - ISO 8601
 * @property {boolean} dry_run
 * @property {string}  employee
 * @property {{ from: string; to: string }} date_range
 * @property {number}  rows_added
 * @property {number}  rows_updated
 * @property {number}  rows_skipped
 * @property {Warning[]} warnings
 */

/**
 * Appends a RunLogEntry to the log file specified in config.
 *
 * @param {RunLogEntry} entry   - The log entry to append.
 * @param {string}      logFilePath - Absolute or relative path to the log file.
 * @param {boolean}     [dryRun=false] - When true, prefixes the line with "[DRY RUN] ".
 */
function appendRunLog(entry, logFilePath, dryRun = false) {
  const resolvedPath = path.resolve(logFilePath);

  // Ensure the directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const serialised = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
    dry_run: dryRun,
  });

  const line = dryRun ? `[DRY RUN] ${serialised}\n` : `${serialised}\n`;

  fs.appendFileSync(resolvedPath, line, 'utf8');
}

/**
 * Creates a new RunLogEntry with default zero-counts and empty warnings.
 *
 * @param {string} employee
 * @param {{ from: string; to: string }} dateRange
 * @param {boolean} dryRun
 * @returns {RunLogEntry}
 */
function createRunLogEntry(employee, dateRange, dryRun = false) {
  return {
    timestamp: new Date().toISOString(),
    dry_run: dryRun,
    employee,
    date_range: dateRange,
    rows_added: 0,
    rows_updated: 0,
    rows_skipped: 0,
    warnings: [],
  };
}

module.exports = { appendRunLog, createRunLogEntry };
