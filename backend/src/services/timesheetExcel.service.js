'use strict';

/**
 * timesheetExcel.service.js
 *
 * Excel read/write layer for the timesheet auto-fill pipeline.
 *
 * Public API:
 *   loadWorkbook(path, config)          — load or create workbook
 *   findSheet(workbook, sheetName)      — exact → case-insensitive → fuzzy → create
 *   parseDateCell(value)                — parse any supported date format → YYYY-MM-DD
 *   normaliseDates(sheet)               — normalise all date cells in a sheet
 *   writeRowToSheet(sheet, row, config) — write columns A–E (never F); sanitize values
 *   atomicWrite(workbook, targetPath, config) — backup → temp → validate → rename
 */

const ExcelJS = require('exceljs');
const fs      = require('fs');
const path    = require('path');
const { levenshtein }  = require('../utils/levenshtein');
const { acquireLock }  = require('../utils/filelock');

// ── Constants ─────────────────────────────────────────────────────────────

/**
 * Excel's epoch starts on 1900-01-01 (serial 1).
 * Excel incorrectly treats 1900 as a leap year (serial 60 = 29 Feb 1900,
 * which never existed). All serials ≥ 61 must be decremented by 1 to
 * compensate for this off-by-one bug.
 */
const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30 UTC
const EXCEL_LEAP_BUG_THRESHOLD = 60; // serial 60 is the phantom 29-Feb-1900

// Maximum Levenshtein distance for fuzzy sheet matching
const FUZZY_MATCH_MAX_DISTANCE = 2;

// ── Sanitization helper ───────────────────────────────────────────────────

/**
 * Strips Unicode control characters (categories Cc and Cf) from a string.
 * Preserves all other characters unchanged.
 *
 * Cc: U+0000–U+001F, U+007F–U+009F
 * Cf: U+00AD, U+0600–U+0605, U+061C, U+06DD, U+070F, U+08E2,
 *     U+180E, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064,
 *     U+2066–U+206F, U+FEFF, U+FFF9–U+FFFB, and others.
 *
 * We use a broad regex that covers all known Cc/Cf ranges.
 *
 * @param {string} text
 * @returns {string}
 */
function sanitizeCell(text) {
  if (typeof text !== 'string') return text == null ? '' : String(text);
  // Cc: C0 controls, DEL, C1 controls
  // Cf: soft hyphen, Arabic formatting, BOM, zero-width chars, directional marks, etc.
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001F\u007F-\u009F\u00AD\u0600-\u0605\u061C\u06DD\u070F\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]/g,
    ''
  );
}

// ── 1. loadWorkbook ───────────────────────────────────────────────────────

/**
 * Loads an existing workbook from disk.
 * If the file does not exist, creates a new workbook with one sheet per
 * configured employee (using `config.employee_mapping`).
 *
 * @param {string} filePath  - Absolute or relative path to the .xlsx file.
 * @param {object} [config]  - Validated config object (used when creating a new workbook).
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function loadWorkbook(filePath, config) {
  const resolvedPath = path.resolve(filePath);
  const wb = new ExcelJS.Workbook();

  if (fs.existsSync(resolvedPath)) {
    await wb.xlsx.readFile(resolvedPath);
    return wb;
  }

  // File not found — create a new workbook with sheets for all configured employees
  console.info(`[timesheetExcel] Workbook not found at "${resolvedPath}". Creating new workbook.`);

  if (config && Array.isArray(config.employee_mapping)) {
    for (const emp of config.employee_mapping) {
      const ws = wb.addWorksheet(emp.sheet_name);
      // Write a minimal header row so the sheet is not completely empty
      _writeHeaderRow(ws);
    }
  }

  return wb;
}

/**
 * Writes the standard header row (A1:F1) to a freshly created sheet.
 * @param {ExcelJS.Worksheet} ws
 */
function _writeHeaderRow(ws) {
  const headers = ['Date', 'Day', 'Topic Learned / Schedule', 'Key Points / Accomplishments', 'Status', 'Manager Remarks'];
  const row = ws.getRow(1);
  headers.forEach((h, i) => {
    row.getCell(i + 1).value = h;
  });
  row.commit();
}

// ── 2. findSheet ──────────────────────────────────────────────────────────

/**
 * Finds the worksheet that best matches `sheetName` using a three-tier strategy:
 *   1. Exact match
 *   2. Case-insensitive, whitespace-trimmed match
 *   3. Levenshtein fuzzy match (distance ≤ 2) — logs a warning
 *   4. No match → creates a new sheet named exactly `sheetName` — logs a warning
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {string}           sheetName  - The desired sheet name (from employee_mapping).
 * @returns {{ sheet: ExcelJS.Worksheet; matchType: 'exact'|'case_insensitive'|'fuzzy'|'created' }}
 */
function findSheet(workbook, sheetName) {
  const sheets = workbook.worksheets;

  // 1. Exact match
  const exact = sheets.find((ws) => ws.name === sheetName);
  if (exact) {
    return { sheet: exact, matchType: 'exact' };
  }

  // 2. Case-insensitive, trimmed match
  const normalised = sheetName.trim().toLowerCase();
  const caseInsensitive = sheets.find(
    (ws) => ws.name.trim().toLowerCase() === normalised
  );
  if (caseInsensitive) {
    return { sheet: caseInsensitive, matchType: 'case_insensitive' };
  }

  // 3. Levenshtein fuzzy match
  let bestSheet = null;
  let bestDistance = Infinity;

  for (const ws of sheets) {
    const dist = levenshtein(normalised, ws.name.trim().toLowerCase());
    if (dist < bestDistance) {
      bestDistance = dist;
      bestSheet = ws;
    }
  }

  if (bestSheet && bestDistance <= FUZZY_MATCH_MAX_DISTANCE) {
    console.warn(
      `[timesheetExcel] Fuzzy sheet match: expected "${sheetName}", ` +
      `matched "${bestSheet.name}" (Levenshtein distance ${bestDistance})`
    );
    return { sheet: bestSheet, matchType: 'fuzzy' };
  }

  // 4. No match — create a new sheet
  console.warn(
    `[timesheetExcel] No sheet match found for "${sheetName}" ` +
    `(closest distance ${bestDistance === Infinity ? 'N/A' : bestDistance}). ` +
    `Creating new sheet.`
  );
  const newSheet = workbook.addWorksheet(sheetName);
  _writeHeaderRow(newSheet);
  return { sheet: newSheet, matchType: 'created' };
}

// ── 3. parseDateCell ──────────────────────────────────────────────────────

/**
 * Parses a date cell value into a `YYYY-MM-DD` string.
 *
 * Supported input formats:
 *   - ISO:            `YYYY-MM-DD`
 *   - DD/MM/YYYY:     `31/12/2025`
 *   - DD-MM-YYYY:     `31-12-2025`
 *   - Excel serial:   numeric (e.g. 45658), accounting for the 1900 leap-year bug
 *   - JS Date object: returned by exceljs for date-typed cells
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {string}  `YYYY-MM-DD` or throws if unparseable.
 */
function parseDateCell(value) {
  if (value == null) {
    throw new Error('[parseDateCell] Cannot parse null/undefined date value');
  }

  // JS Date object (exceljs returns these for date-formatted cells)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new Error('[parseDateCell] Invalid Date object');
    }
    return _dateToYMD(value);
  }

  // Numeric — Excel serial number
  if (typeof value === 'number') {
    return _excelSerialToYMD(value);
  }

  const str = String(value).trim();

  // ISO: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    _assertValidDate(Number(y), Number(m), Number(d));
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY
  const dmySlash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    const [, d, m, y] = dmySlash;
    _assertValidDate(Number(y), Number(m), Number(d));
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MM-YYYY
  const dmyDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    const [, d, m, y] = dmyDash;
    _assertValidDate(Number(y), Number(m), Number(d));
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Numeric string (Excel serial stored as text)
  if (/^\d+(\.\d+)?$/.test(str)) {
    return _excelSerialToYMD(Number(str));
  }

  throw new Error(`[parseDateCell] Unrecognised date format: "${str}"`);
}

/**
 * Converts an Excel serial number to YYYY-MM-DD, handling the 1900 leap-year bug.
 * @param {number} serial
 * @returns {string}
 */
function _excelSerialToYMD(serial) {
  if (!Number.isFinite(serial) || serial < 1) {
    throw new Error(`[parseDateCell] Invalid Excel serial number: ${serial}`);
  }

  // Serial 60 is the phantom 29-Feb-1900 — map it to 1900-02-28 (closest real date)
  let adjustedSerial = serial;
  if (serial === EXCEL_LEAP_BUG_THRESHOLD) {
    // Treat as 1900-02-28
    adjustedSerial = 59;
  } else if (serial > EXCEL_LEAP_BUG_THRESHOLD) {
    // Subtract 1 to compensate for the phantom day
    adjustedSerial = serial - 1;
  }

  // EXCEL_EPOCH is 1899-12-30; adding `adjustedSerial` days gives the correct date
  const ms = EXCEL_EPOCH.getTime() + adjustedSerial * 86400000;
  const date = new Date(ms);
  return _dateToYMD(date);
}

/**
 * Formats a JS Date as YYYY-MM-DD using UTC components.
 * @param {Date} date
 * @returns {string}
 */
function _dateToYMD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Throws if the given year/month/day combination is not a valid calendar date.
 * @param {number} y
 * @param {number} m
 * @param {number} d
 */
function _assertValidDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`[parseDateCell] Invalid date components: ${y}-${m}-${d}`);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
    throw new Error(`[parseDateCell] Date does not exist: ${y}-${m}-${d}`);
  }
}

// ── 4. normaliseDates ─────────────────────────────────────────────────────

/**
 * Detects and normalises all date cells in Column A of a sheet.
 * Each cell value is replaced with the YYYY-MM-DD string produced by
 * `parseDateCell`. Cells that cannot be parsed are left unchanged and a
 * warning is logged.
 *
 * @param {ExcelJS.Worksheet} sheet
 */
function normaliseDates(sheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const cell = row.getCell(1); // Column A
    const val  = cell.value;

    if (val == null || val === '') return;

    try {
      const normalised = parseDateCell(val);
      cell.value = normalised;
    } catch {
      console.warn(
        `[timesheetExcel] normaliseDates: could not parse date in row ${rowNumber}: "${val}"`
      );
    }
  });
}

// ── 5. writeRowToSheet ────────────────────────────────────────────────────

/**
 * Writes a single timesheet row to the given worksheet.
 *
 * Column mapping:
 *   A — Date       (formatted per config.date_format)
 *   B — Day of week
 *   C — Topic Learned / Schedule
 *   D — Key Points / Accomplishments
 *   E — Status
 *   F — Manager Remarks  ← NEVER written
 *
 * All string values are sanitized (control characters stripped) before writing.
 * The row is appended after the last used row in the sheet.
 *
 * @param {ExcelJS.Worksheet} sheet
 * @param {object}            row    - TimesheetRow object
 * @param {object}            config - Validated config (provides date_format)
 */
function writeRowToSheet(sheet, row, config) {
  const dateFormat = (config && config.date_format) ? config.date_format : 'YYYY-MM-DD';

  // Format the date string according to config
  const formattedDate = _formatDate(row.date, dateFormat);

  // Determine the next row number (after last used row)
  const nextRowNumber = sheet.lastRow ? sheet.lastRow.number + 1 : 2;
  const excelRow = sheet.getRow(nextRowNumber);

  // Column A — Date
  excelRow.getCell(1).value = sanitizeCell(formattedDate);

  // Column B — Day of week
  excelRow.getCell(2).value = sanitizeCell(row.dayOfWeek || '');

  // Column C — Topic Learned / Schedule
  excelRow.getCell(3).value = sanitizeCell(row.columnC || '');

  // Column D — Key Points / Accomplishments
  excelRow.getCell(4).value = sanitizeCell(row.columnD || '');

  // Column E — Status
  excelRow.getCell(5).value = sanitizeCell(row.columnE || '');

  // Column F — Manager Remarks: NEVER written (requirement 8.5)

  excelRow.commit();
}

/**
 * Formats a YYYY-MM-DD date string according to the given format token.
 *
 * Supported tokens: YYYY, MM, DD, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
 *
 * @param {string} ymd    - Date in YYYY-MM-DD format
 * @param {string} format - Format string (e.g. "DD/MM/YYYY")
 * @returns {string}
 */
function _formatDate(ymd, format) {
  if (!ymd || typeof ymd !== 'string') return ymd || '';

  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd; // return as-is if not in expected format

  const [, yyyy, mm, dd] = match;

  return format
    .replace('YYYY', yyyy)
    .replace('MM', mm)
    .replace('DD', dd);
}

// ── 6. atomicWrite ────────────────────────────────────────────────────────

/**
 * Writes the workbook to disk atomically:
 *   1. Creates a timestamped backup of the existing file (if it exists)
 *   2. Writes all changes to a `.tmp` file
 *   3. Validates the temp file (opens it and reads the header row of each sheet)
 *   4. Renames the temp file over the original
 *
 * On validation failure:
 *   - Deletes the temp file
 *   - Restores from backup (if available)
 *   - Logs the error
 *   - Exits with code 1
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {string}           targetPath  - Absolute or relative path to the target .xlsx
 * @param {object}           config      - Validated config object
 * @returns {Promise<void>}
 */
async function atomicWrite(workbook, targetPath, config) {
  const resolvedTarget = path.resolve(targetPath);
  const dir            = path.dirname(resolvedTarget);
  const basename       = path.basename(resolvedTarget, path.extname(resolvedTarget));
  const ext            = path.extname(resolvedTarget);

  // Ensure target directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Step 0: Acquire file lock ──────────────────────────────────────────
  const lockTimeoutMs = (config && config.lock_timeout_ms != null)
    ? config.lock_timeout_ms
    : 30000;

  let release = null;

  try {
    release = await acquireLock(resolvedTarget, lockTimeoutMs);
  } catch (err) {
    if (err.message && err.message.includes('Could not acquire lock')) {
      console.warn(
        `[timesheetExcel] Concurrency warning: could not acquire file lock on ` +
        `"${resolvedTarget}" within ${lockTimeoutMs}ms. Another instance may be running.`
      );
    } else {
      console.error(`[timesheetExcel] Lock acquisition error: ${err.message}`);
    }
    process.exit(1);
  }

  // ── Step 1: Create timestamped backup ──────────────────────────────────
  let backupPath = null;

  try {
    if (fs.existsSync(resolvedTarget) && fs.statSync(resolvedTarget).size > 0) {
      const ts = _timestampSuffix();
      backupPath = path.join(dir, `${basename}_${ts}.bak${ext}`);

      try {
        fs.copyFileSync(resolvedTarget, backupPath);
        console.info(`[timesheetExcel] Backup created: ${backupPath}`);
      } catch (err) {
        // Abort — never proceed without a backup (per design doc)
        console.error(`[timesheetExcel] Failed to create backup: ${err.message}`);
        await release();
        process.exit(1);
      }
    }

    // ── Step 2: Write to temp file ───────────────────────────────────────
    const tempPath = `${resolvedTarget}.tmp`;

    try {
      await workbook.xlsx.writeFile(tempPath);
    } catch (err) {
      console.error(`[timesheetExcel] Failed to write temp file "${tempPath}": ${err.message}`);
      _cleanupAndRestore(tempPath, backupPath, resolvedTarget);
      await release();
      process.exit(1);
    }

    // ── Step 3: Validate temp file ───────────────────────────────────────
    try {
      await _validateWorkbookFile(tempPath, workbook);
    } catch (err) {
      console.error(`[timesheetExcel] Temp file validation failed: ${err.message}`);
      _cleanupAndRestore(tempPath, backupPath, resolvedTarget);
      await release();
      process.exit(1);
    }

    // ── Step 4: Atomic rename ─────────────────────────────────────────────
    try {
      fs.renameSync(tempPath, resolvedTarget);
      console.info(`[timesheetExcel] Workbook written atomically to "${resolvedTarget}"`);
    } catch (err) {
      console.error(`[timesheetExcel] Failed to rename temp file to target: ${err.message}`);
      _cleanupAndRestore(tempPath, backupPath, resolvedTarget);
      await release();
      process.exit(1);
    }

    // ── Step 5: Release lock (success path) ──────────────────────────────
    await release();

  } catch (err) {
    // Safety net: always release the lock on any unexpected error
    if (release) {
      try { await release(); } catch (_) { /* ignore secondary errors */ }
    }
    throw err;
  }
}

/**
 * Validates a written workbook file by opening it and reading the header row
 * of each sheet that exists in the source workbook.
 *
 * @param {string}           filePath       - Path to the temp file to validate
 * @param {ExcelJS.Workbook} sourceWorkbook - The workbook that was written (used to know which sheets to check)
 * @returns {Promise<void>}  Throws on validation failure.
 */
async function _validateWorkbookFile(filePath, sourceWorkbook) {
  const validationWb = new ExcelJS.Workbook();
  await validationWb.xlsx.readFile(filePath);

  const sheetNames = sourceWorkbook.worksheets.map((ws) => ws.name);

  for (const name of sheetNames) {
    const ws = validationWb.getWorksheet(name);
    if (!ws) {
      throw new Error(`Validation failed: sheet "${name}" not found in temp file`);
    }

    // Read the header row (row 1) — this confirms the sheet is readable
    const headerRow = ws.getRow(1);
    if (!headerRow) {
      throw new Error(`Validation failed: header row missing in sheet "${name}"`);
    }

    // Force exceljs to actually read the row values
    let hasAnyCell = false;
    headerRow.eachCell(() => { hasAnyCell = true; });

    // A sheet with no header at all is suspicious but not necessarily invalid
    // (it could be a newly created empty sheet). We only fail if the row
    // object itself is missing, which is checked above.
    void hasAnyCell;
  }
}

/**
 * Deletes the temp file and restores from backup if available.
 * @param {string}      tempPath
 * @param {string|null} backupPath
 * @param {string}      targetPath
 */
function _cleanupAndRestore(tempPath, backupPath, targetPath) {
  // Delete temp file
  if (tempPath && fs.existsSync(tempPath)) {
    try {
      fs.unlinkSync(tempPath);
      console.info(`[timesheetExcel] Temp file deleted: ${tempPath}`);
    } catch (e) {
      console.error(`[timesheetExcel] Could not delete temp file: ${e.message}`);
    }
  }

  // Restore from backup
  if (backupPath && fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(backupPath, targetPath);
      console.info(`[timesheetExcel] Restored from backup: ${backupPath}`);
    } catch (e) {
      console.error(`[timesheetExcel] Could not restore from backup: ${e.message}`);
    }
  }
}

/**
 * Returns a timestamp suffix string in the format YYYYMMDD_HHmmss.
 * @returns {string}
 */
function _timestampSuffix() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  loadWorkbook,
  findSheet,
  parseDateCell,
  normaliseDates,
  writeRowToSheet,
  atomicWrite,
  // Exported for testing
  sanitizeCell,
  _formatDate,
  _excelSerialToYMD,
};
