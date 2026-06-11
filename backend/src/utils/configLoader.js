'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Required top-level fields in timesheet_config.yaml.
 * Each entry is either a string (simple required key) or an object
 * describing a nested required structure.
 */
const REQUIRED_FIELDS = [
  'workbook_path',
  'log_file_path',
  'date_format',
  'work_day',
  'lunch_block',
  'final_review_block',
  'lock_timeout_ms',
  'dry_run',
  'employee_mapping',
];

const REQUIRED_WORK_DAY_FIELDS = ['start', 'end'];
const REQUIRED_LUNCH_BLOCK_FIELDS = ['start', 'end', 'label'];
const REQUIRED_FINAL_REVIEW_FIELDS = ['label'];

/**
 * Loads and validates timesheet_config.yaml.
 *
 * Exits with code 1 if:
 *   - The file is missing
 *   - The file cannot be parsed as valid YAML
 *   - Any required field is absent
 *
 * @param {string} configPath - Absolute or relative path to the YAML config file.
 * @returns {object} Validated config object.
 */
function loadConfig(configPath) {
  const resolvedPath = path.resolve(configPath);

  // --- 1. File existence check ---
  if (!fs.existsSync(resolvedPath)) {
    console.error(`[configLoader] Config file not found: ${resolvedPath}`);
    process.exit(1);
  }

  // --- 2. Parse YAML ---
  let config;
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    config = yaml.load(raw);
  } catch (err) {
    console.error(`[configLoader] Failed to parse YAML config at ${resolvedPath}: ${err.message}`);
    process.exit(1);
  }

  if (!config || typeof config !== 'object') {
    console.error(`[configLoader] Config file is empty or not a YAML mapping: ${resolvedPath}`);
    process.exit(1);
  }

  // --- 3. Required top-level fields ---
  const missingTop = REQUIRED_FIELDS.filter((f) => config[f] === undefined || config[f] === null);
  if (missingTop.length > 0) {
    console.error(`[configLoader] Missing required config fields: ${missingTop.join(', ')}`);
    process.exit(1);
  }

  // --- 4. Nested field validation ---
  const missingWorkDay = REQUIRED_WORK_DAY_FIELDS.filter(
    (f) => !config.work_day || config.work_day[f] === undefined
  );
  if (missingWorkDay.length > 0) {
    console.error(`[configLoader] Missing required work_day fields: ${missingWorkDay.join(', ')}`);
    process.exit(1);
  }

  const missingLunch = REQUIRED_LUNCH_BLOCK_FIELDS.filter(
    (f) => !config.lunch_block || config.lunch_block[f] === undefined
  );
  if (missingLunch.length > 0) {
    console.error(`[configLoader] Missing required lunch_block fields: ${missingLunch.join(', ')}`);
    process.exit(1);
  }

  const missingFinalReview = REQUIRED_FINAL_REVIEW_FIELDS.filter(
    (f) => !config.final_review_block || config.final_review_block[f] === undefined
  );
  if (missingFinalReview.length > 0) {
    console.error(
      `[configLoader] Missing required final_review_block fields: ${missingFinalReview.join(', ')}`
    );
    process.exit(1);
  }

  // --- 5. employee_mapping must be a non-empty array ---
  if (!Array.isArray(config.employee_mapping) || config.employee_mapping.length === 0) {
    console.error('[configLoader] employee_mapping must be a non-empty array');
    process.exit(1);
  }

  for (let i = 0; i < config.employee_mapping.length; i++) {
    const entry = config.employee_mapping[i];
    if (!entry || entry.db_user_id === undefined || !entry.sheet_name) {
      console.error(
        `[configLoader] employee_mapping[${i}] must have db_user_id and sheet_name`
      );
      process.exit(1);
    }
  }

  // --- 6. Normalise optional list fields ---
  if (!Array.isArray(config.public_holidays)) {
    config.public_holidays = [];
  }
  if (!Array.isArray(config.restricted_holidays)) {
    config.restricted_holidays = [];
  }

  return config;
}

module.exports = { loadConfig };
