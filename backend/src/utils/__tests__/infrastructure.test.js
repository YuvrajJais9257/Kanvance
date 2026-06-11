'use strict';

/**
 * Unit tests for infrastructure utilities:
 *   - configLoader.js
 *   - runLogger.js
 *   - levenshtein.js
 *   - filelock.js
 *
 * Requirements: 2.1, 2.2, 2.3, 12.1, 12.3, 12.4, 14.1
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── configLoader ────────────────────────────────────────────────────────────

describe('configLoader', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeYaml(filename, content) {
    const p = path.join(tmpDir, filename);
    fs.writeFileSync(p, content, 'utf8');
    return p;
  }

  const VALID_YAML = `
workbook_path: "./timesheets/team.xlsx"
log_file_path: "./logs/run.log"
date_format: "DD/MM/YYYY"
work_day:
  start: "09:00"
  end: "18:00"
lunch_block:
  start: "13:00"
  end: "14:00"
  label: "Lunch"
final_review_block:
  label: "Final Review"
lock_timeout_ms: 30000
dry_run: false
employee_mapping:
  - db_user_id: 1
    sheet_name: "Alice"
`;

  test('loads a valid config without error', () => {
    const p = writeYaml('valid.yaml', VALID_YAML);
    // We need to require after writing the file
    const { loadConfig } = require('../configLoader');
    const config = loadConfig(p);
    expect(config.workbook_path).toBe('./timesheets/team.xlsx');
    expect(config.work_day.start).toBe('09:00');
    expect(config.employee_mapping).toHaveLength(1);
    expect(config.public_holidays).toEqual([]);
    expect(config.restricted_holidays).toEqual([]);
  });

  test('exits with code 1 when file is missing', () => {
    const { loadConfig } = require('../configLoader');
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    expect(() => loadConfig(path.join(tmpDir, 'nonexistent.yaml'))).toThrow('process.exit(1)');
    mockExit.mockRestore();
  });

  test('exits with code 1 when YAML is unparseable', () => {
    const p = writeYaml('bad.yaml', '{ invalid yaml: [unclosed');
    const { loadConfig } = require('../configLoader');
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    expect(() => loadConfig(p)).toThrow('process.exit(1)');
    mockExit.mockRestore();
  });

  test('exits with code 1 when required top-level field is missing', () => {
    const missingField = VALID_YAML.replace('workbook_path: "./timesheets/team.xlsx"\n', '');
    const p = writeYaml('missing.yaml', missingField);
    const { loadConfig } = require('../configLoader');
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    expect(() => loadConfig(p)).toThrow('process.exit(1)');
    mockExit.mockRestore();
  });

  test('exits with code 1 when work_day.start is missing', () => {
    const yaml = VALID_YAML.replace('  start: "09:00"\n', '');
    const p = writeYaml('missing_workday.yaml', yaml);
    const { loadConfig } = require('../configLoader');
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    expect(() => loadConfig(p)).toThrow('process.exit(1)');
    mockExit.mockRestore();
  });

  test('exits with code 1 when employee_mapping is empty', () => {
    const yaml = VALID_YAML.replace(
      'employee_mapping:\n  - db_user_id: 1\n    sheet_name: "Alice"\n',
      'employee_mapping: []\n'
    );
    const p = writeYaml('empty_mapping.yaml', yaml);
    const { loadConfig } = require('../configLoader');
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    expect(() => loadConfig(p)).toThrow('process.exit(1)');
    mockExit.mockRestore();
  });
});

// ─── runLogger ───────────────────────────────────────────────────────────────

describe('runLogger', () => {
  let tmpDir;
  let logFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-test-'));
    logFile = path.join(tmpDir, 'run.log');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { appendRunLog, createRunLogEntry } = require('../runLogger');

  test('createRunLogEntry returns an entry with all required fields', () => {
    const entry = createRunLogEntry('Alice', { from: '2025-01-01', to: '2025-01-31' }, false);
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('dry_run', false);
    expect(entry).toHaveProperty('employee', 'Alice');
    expect(entry).toHaveProperty('date_range');
    expect(entry.date_range).toEqual({ from: '2025-01-01', to: '2025-01-31' });
    expect(entry).toHaveProperty('rows_added', 0);
    expect(entry).toHaveProperty('rows_updated', 0);
    expect(entry).toHaveProperty('rows_skipped', 0);
    expect(entry).toHaveProperty('warnings');
    expect(Array.isArray(entry.warnings)).toBe(true);
  });

  test('appendRunLog writes a JSON line to the log file', () => {
    const entry = createRunLogEntry('Bob', { from: '2025-02-01', to: '2025-02-28' }, false);
    appendRunLog(entry, logFile, false);

    const content = fs.readFileSync(logFile, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.employee).toBe('Bob');
    expect(parsed.dry_run).toBe(false);
  });

  test('appendRunLog prefixes line with [DRY RUN] in dry-run mode', () => {
    const entry = createRunLogEntry('Carol', { from: '2025-03-01', to: '2025-03-31' }, true);
    appendRunLog(entry, logFile, true);

    const content = fs.readFileSync(logFile, 'utf8');
    expect(content.trim()).toMatch(/^\[DRY RUN\] /);
    const jsonPart = content.trim().replace(/^\[DRY RUN\] /, '');
    const parsed = JSON.parse(jsonPart);
    expect(parsed.dry_run).toBe(true);
    expect(parsed.employee).toBe('Carol');
  });

  test('appendRunLog appends multiple entries', () => {
    const e1 = createRunLogEntry('Alice', { from: '2025-01-01', to: '2025-01-31' });
    const e2 = createRunLogEntry('Bob', { from: '2025-01-01', to: '2025-01-31' });
    appendRunLog(e1, logFile);
    appendRunLog(e2, logFile);

    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).employee).toBe('Alice');
    expect(JSON.parse(lines[1]).employee).toBe('Bob');
  });

  test('appendRunLog creates parent directories if they do not exist', () => {
    const nestedLog = path.join(tmpDir, 'nested', 'deep', 'run.log');
    const entry = createRunLogEntry('Dave', { from: '2025-01-01', to: '2025-01-31' });
    appendRunLog(entry, nestedLog);
    expect(fs.existsSync(nestedLog)).toBe(true);
  });
});

// ─── levenshtein ─────────────────────────────────────────────────────────────

describe('levenshtein', () => {
  const { levenshtein } = require('../levenshtein');

  test('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  test('returns length of b when a is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
  });

  test('returns length of a when b is empty', () => {
    expect(levenshtein('abc', '')).toBe(3);
  });

  test('single substitution', () => {
    expect(levenshtein('kitten', 'sitten')).toBe(1);
  });

  test('classic kitten → sitting example', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  test('single insertion', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
  });

  test('single deletion', () => {
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });

  test('is symmetric', () => {
    expect(levenshtein('Alice Johnson', 'alice johnson')).toBe(
      levenshtein('alice johnson', 'Alice Johnson')
    );
  });

  test('sheet name fuzzy match scenario (distance ≤ 2)', () => {
    expect(levenshtein('Alice Johnson', 'Alice  Johnson')).toBeLessThanOrEqual(2);
  });

  test('throws TypeError for non-string arguments', () => {
    expect(() => levenshtein(null, 'abc')).toThrow(TypeError);
    expect(() => levenshtein('abc', 42)).toThrow(TypeError);
  });
});

// ─── filelock ────────────────────────────────────────────────────────────────

describe('filelock', () => {
  let tmpDir;
  let testFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
    testFile = path.join(tmpDir, 'workbook.xlsx');
    fs.writeFileSync(testFile, 'placeholder', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { acquireLock } = require('../filelock');

  test('acquires and releases a lock successfully', async () => {
    const release = await acquireLock(testFile, 5000);
    expect(typeof release).toBe('function');
    await release();
  });

  test('can re-acquire lock after release', async () => {
    const release1 = await acquireLock(testFile, 5000);
    await release1();
    const release2 = await acquireLock(testFile, 5000);
    expect(typeof release2).toBe('function');
    await release2();
  });

  test('throws when lock cannot be acquired within timeout', async () => {
    const release = await acquireLock(testFile, 5000);
    try {
      await expect(acquireLock(testFile, 300)).rejects.toThrow(/Could not acquire lock/);
    } finally {
      await release();
    }
  });

  test('creates the file if it does not exist', async () => {
    const newFile = path.join(tmpDir, 'new_workbook.xlsx');
    expect(fs.existsSync(newFile)).toBe(false);
    const release = await acquireLock(newFile, 5000);
    expect(fs.existsSync(newFile)).toBe(true);
    await release();
  });
});
