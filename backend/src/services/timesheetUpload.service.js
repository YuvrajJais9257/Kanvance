'use strict';

/**
 * timesheetUpload.service.js
 *
 * Upload confirmation service for the Excel Timesheet Auto-Fill feature.
 * Handles SHA-256 hash comparison, entry_source diffing, and row confirmation.
 *
 * Exported functions:
 *   hashFile(buffer)                            — SHA-256 hex digest of a Buffer
 *   diffAndStampRows(uploadedRows, storedRows)  — compare C/D/E values, stamp confirmation metadata
 *   confirmRows(rowIds)                         — set is_confirmed=TRUE on given row IDs
 */

const crypto = require('crypto');
const pool   = require('../config/db');

// ── hashFile ──────────────────────────────────────────────────────────────

/**
 * Computes the SHA-256 hash of a Buffer and returns it as a lowercase hex string.
 *
 * Used by the upload controller to compare the uploaded file against the last
 * auto-generated file. When hashes match, the controller calls confirmRows()
 * directly without changing entry_source (Req 9.4).
 *
 * @param {Buffer} buffer - Raw file bytes.
 * @returns {string} Lowercase hex SHA-256 digest (64 characters).
 */
function hashFile(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ── diffAndStampRows ──────────────────────────────────────────────────────

/**
 * Compares uploaded Column C/D/E values against the last auto-generated values
 * stored in the DB, then stamps confirmation metadata on each row.
 *
 * Rules (Requirements 9.1 – 9.5):
 *   • If uploaded task_name (C), subtask_name (D), or status_final/status_uploaded (E)
 *     differs from the stored values → set entry_source = 'manual_override'
 *   • If all three are identical → leave entry_source unchanged (retain stored value)
 *   • In all cases → set is_confirmed = TRUE and last_confirmed_at = NOW()
 *   • Uploaded rows with no matching id in storedRows (new rows) →
 *     entry_source = 'manual_override', is_confirmed = TRUE, last_confirmed_at = NOW()
 *
 * @param {UploadedRow[]} uploadedRows
 *   Each object must have: { id?, task_name, subtask_name, status_final | status_uploaded }
 * @param {StoredRow[]} storedRows
 *   Each object must have: { id, task_name, subtask_name, status_final, entry_source }
 *
 * @returns {StampedRow[]}
 *   Array of objects: { id, entry_source, is_confirmed, last_confirmed_at }
 *   For new rows (no matching id), id is null/undefined.
 */
function diffAndStampRows(uploadedRows, storedRows) {
  // Build a lookup map from storedRows by id for O(1) access
  const storedMap = new Map();
  for (const stored of storedRows) {
    if (stored.id != null) {
      storedMap.set(stored.id, stored);
    }
  }

  const now = new Date();
  const stamped = [];

  for (const uploaded of uploadedRows) {
    // Normalise the uploaded Column E value — the field may be named either
    // status_final (auto-fill pipeline) or status_uploaded (raw parse pipeline)
    const uploadedE = _normalise(uploaded.status_final ?? uploaded.status_uploaded);

    const stored = uploaded.id != null ? storedMap.get(uploaded.id) : undefined;

    if (!stored) {
      // New row — not in DB (Req 9.5)
      stamped.push({
        id:                uploaded.id ?? null,
        entry_source:      'manual_override',
        is_confirmed:      true,
        last_confirmed_at: now,
      });
      continue;
    }

    // Compare uploaded C/D/E against stored values
    const uploadedC = _normalise(uploaded.task_name);
    const uploadedD = _normalise(uploaded.subtask_name);

    const storedC = _normalise(stored.task_name);
    const storedD = _normalise(stored.subtask_name);
    const storedE = _normalise(stored.status_final);

    const isDifferent =
      uploadedC !== storedC ||
      uploadedD !== storedD ||
      uploadedE !== storedE;

    stamped.push({
      id:                stored.id,
      entry_source:      isDifferent ? 'manual_override' : stored.entry_source,
      is_confirmed:      true,
      last_confirmed_at: now,
    });
  }

  return stamped;
}

// ── confirmRows ───────────────────────────────────────────────────────────

/**
 * Sets is_confirmed = TRUE and last_confirmed_at = NOW() on all timesheet_rows
 * whose id is in the rowIds array.
 *
 * Used for hash-identical uploads (Req 9.4) where the controller just needs to
 * confirm rows without changing entry_source, and as the final persistence step
 * after diffAndStampRows has been used to decide entry_source values.
 *
 * @param {number[]} rowIds - Array of timesheet_rows primary-key IDs.
 * @returns {Promise<{ affected: number }>}
 */
async function confirmRows(rowIds) {
  if (!rowIds || rowIds.length === 0) {
    return { affected: 0 };
  }

  // Build a parameterised IN clause — safe against SQL injection
  const placeholders = rowIds.map(() => '?').join(', ');
  const [result] = await pool.execute(
    `UPDATE timesheet_rows
        SET is_confirmed      = TRUE,
            last_confirmed_at = NOW()
      WHERE id IN (${placeholders})`,
    rowIds
  );

  return { affected: result.affectedRows };
}

// ── Private helpers ───────────────────────────────────────────────────────

/**
 * Normalises a cell value for comparison:
 *   - null / undefined → empty string
 *   - trims surrounding whitespace
 *   - lowercases for case-insensitive comparison
 *
 * @param {any} value
 * @returns {string}
 */
function _normalise(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  hashFile,
  diffAndStampRows,
  confirmRows,
};
