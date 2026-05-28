/**
 * timesheet.service.js
 *
 * Timesheet Excel pipeline:
 *   1. generateTemplate()  — build blank .xlsx for users to fill in
 *   2. parseUpload()       — parse uploaded .xlsx into row objects
 *   3. enrichRows()        — cross-reference DB; uploaded values win (source of truth)
 *   4. exportEnriched()    — build final clean .xlsx with no conflict markers
 */
const ExcelJS = require("exceljs");
const pool    = require("../config/db");
const ActivityLogModel  = require("../models/activityLog.model");
const TimesheetRunModel = require("../models/timesheetRun.model");

// ── Colour palette ────────────────────────────────────────────────────────
const COLORS = {
  headerBg:   "FF1E293B",  // dark slate
  headerFont: "FFF1F5F9",  // near-white
  altRow:     "FF0F172A",  // darker row
  baseRow:    "FF1E293B",  // base row
  matched:    "FF14532D",  // dark green tint for matched rows
  unmatched:  "FF1E293B",  // normal
  accent:     "FF6366F1",  // indigo accent
};

// ── Column definitions (matches template + parse + export) ───────────────
const COLUMNS = [
  { header: "Date",          key: "logged_date",    width: 14 },
  { header: "Employee Name", key: "employee",       width: 22 },
  { header: "Project Name",  key: "project_name",   width: 30 },
  { header: "Task",          key: "task_name",       width: 30 },
  { header: "Subtask",       key: "subtask_name",    width: 30 },
  { header: "Hours Spent",   key: "hours_final",     width: 14 },
  { header: "Status",        key: "status_final",    width: 20 },
  { header: "Notes",         key: "notes",           width: 40 },
];

// ── 1. Generate blank template ────────────────────────────────────────────
exports.generateTemplate = async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CyberArk Practice Tracker";
  wb.created = new Date();

  const ws = wb.addWorksheet("Timesheet", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = COLUMNS.map((c) => ({ ...c }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    cell.font   = { bold: true, color: { argb: COLORS.headerFont }, size: 11 };
    cell.border = { bottom: { style: "medium", color: { argb: COLORS.accent } } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 28;

  // Add 3 example rows so users understand the format
  const examples = [
    {
      logged_date: new Date().toISOString().split("T")[0],
      employee:    "Your Name",
      project_name:"Project Name (e.g. HDFC Bank)",
      task_name:   "Task Name (e.g. Tenant Activation)",
      subtask_name:"Subtask (optional)",
      hours_final: 4.0,
      status_final:"In Progress",
      notes:       "Optional notes",
    },
  ];
  examples.forEach((ex, i) => {
    const row = ws.addRow(ex);
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid",
        fgColor: { argb: i % 2 === 0 ? COLORS.baseRow : COLORS.altRow } };
      cell.font = { color: { argb: "FF94A3B8" }, italic: true };
    });
  });

  // Instructions sheet
  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 80;
  const instructions = [
    ["CyberArk Practice Tracker — Timesheet Template"],
    [""],
    ["HOW TO FILL IN THIS TEMPLATE:"],
    ["1. Date          — Use YYYY-MM-DD format (e.g. 2026-05-20)"],
    ["2. Employee Name — Must match your display name in the system"],
    ["3. Project Name  — Use the customer/project name as shown in the portal"],
    ["4. Task          — The activity group / phase name"],
    ["5. Subtask       — Optional: the specific subtask name"],
    ["6. Hours Spent   — Decimal hours (e.g. 2.5 for 2h 30m)"],
    ["7. Status        — Not Started / In Progress / In Testing / Done / Blocked"],
    ["8. Notes         — Any free-text notes"],
    [""],
    ["IMPORTANT:"],
    ["- Delete the example row before uploading"],
    ["- Do not add or remove columns"],
    ["- Upload via Reports → Upload Timesheet in the portal"],
  ];
  instructions.forEach(([text]) => {
    const row = info.addRow([text]);
    if (text.startsWith("CyberArk")) {
      row.getCell(1).font = { bold: true, size: 14, color: { argb: COLORS.accent } };
    } else if (text.endsWith(":")) {
      row.getCell(1).font = { bold: true };
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  return buf;
};

// ── 2. Parse uploaded .xlsx ───────────────────────────────────────────────
exports.parseUpload = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.getWorksheet("Timesheet") || wb.worksheets[0];
  if (!ws) throw Object.assign(new Error("No worksheet found in uploaded file"), { status: 400 });

  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const vals = row.values; // 1-indexed

    const logged_date    = _cellStr(vals[1]);
    const employee       = _cellStr(vals[2]);
    const project_name   = _cellStr(vals[3]);
    const task_name      = _cellStr(vals[4]);
    const subtask_name   = _cellStr(vals[5]);
    const hours_uploaded = _cellNum(vals[6]);
    const status_uploaded = _cellStr(vals[7]);
    const notes          = _cellStr(vals[8]);

    // Skip completely empty rows
    if (!employee && !project_name && !task_name) return;

    rows.push({
      row_num:        rowNum,
      logged_date:    _normaliseDate(logged_date),
      employee,
      project_name,
      task_name,
      subtask_name,
      hours_uploaded,
      status_uploaded,
      notes,
    });
  });

  if (!rows.length) throw Object.assign(new Error("No data rows found in uploaded file"), { status: 400 });
  return rows;
};

// ── 3. Enrich rows against DB ─────────────────────────────────────────────
// Uploaded values are the source of truth.
// DB values fill in gaps (hours from activity_logs, status from subtasks).
exports.enrichRows = async (parsedRows) => {
  // Pre-load all projects + subtasks for matching (avoid N+1)
  const [projects] = await pool.execute(
    `SELECT p.id, p.name AS project_name, c.name AS customer_name
     FROM projects p JOIN customers c ON c.id = p.customer_id`
  );
  const [subtasks] = await pool.execute(
    `SELECT s.id, s.name AS subtask_name, s.status, ag.name AS group_name, ag.project_id
     FROM subtasks s JOIN activity_groups ag ON ag.id = s.group_id`
  );

  const enriched = [];

  for (const row of parsedRows) {
    // Match project (case-insensitive, partial) — only used to resolve project_id.
    // project_name always comes strictly from the current row; never from a previous
    // upload or from the DB canonical name, to prevent stale-name bleed-through.
    const matchedProject = _matchProject(row.project_name, projects);
    const project_id     = matchedProject?.id ?? null;
    const project_name   = String(row.project_name ?? "").trim() || null;

    // Match subtask (by task name + subtask name within matched project)
    const matchedSubtask = project_id
      ? _matchSubtask(row.task_name, row.subtask_name, subtasks, project_id)
      : null;

    // DB hours: sum from activity_logs for this employee + project
    let hours_db = null;
    if (project_id && row.employee) {
      hours_db = await ActivityLogModel.sumByEmployeeProject(row.employee, project_id);
    }

    // DB status: from matched subtask
    const status_db = matchedSubtask?.status ?? null;

    // Uploaded values win — fill gaps from DB only when upload is blank
    const hours_final  = row.hours_uploaded ?? hours_db ?? null;
    const status_final = row.status_uploaded || status_db || "Not Started";

    enriched.push({
      ...row,
      project_id,
      project_name,
      subtask_id:   matchedSubtask?.id ?? null,
      task_name:    matchedSubtask?.group_name  ?? row.task_name,
      subtask_name: matchedSubtask?.subtask_name ?? row.subtask_name,
      hours_db,
      hours_final,
      status_db,
      status_final,
      matched: !!matchedProject,
    });
  }

  return enriched;
};

// ── 4. Sync enriched rows to activity_logs (deduplication) ───────────────
// Inserts new entries into activity_logs if they don't already exist.
// Deduplication key: user + date + project_id + subtask_id (or task name if no subtask)
exports.syncToActivityLogs = async (enrichedRows) => {
  const inserted = [];
  const skipped  = [];

  for (const row of enrichedRows) {
    // Skip rows without required data
    if (!row.employee || !row.logged_date || !row.project_id || !row.hours_final) {
      skipped.push({ row: row.row_num, reason: "Missing required fields" });
      continue;
    }

    // Find user_id by employee name (case-insensitive)
    const [[user]] = await pool.execute(
      `SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1`,
      [row.employee]
    );
    const user_id = user?.id ?? null;

    // Check if entry already exists (deduplication)
    // Key: user + date + project + subtask (or null if no subtask match)
    const [[existing]] = await pool.execute(
      `SELECT id FROM activity_logs
       WHERE employee = ?
         AND logged_date = ?
         AND project_id = ?
         AND (subtask_id = ? OR (subtask_id IS NULL AND ? IS NULL))
       LIMIT 1`,
      [row.employee, row.logged_date, row.project_id, row.subtask_id ?? null, row.subtask_id ?? null]
    );

    if (existing) {
      skipped.push({ row: row.row_num, reason: "Already exists in activity_logs" });
      continue;
    }

    // Insert new entry
    const logId = await ActivityLogModel.create({
      subtask_id:  row.subtask_id ?? null,
      project_id:  row.project_id,
      user_id:     user_id,
      employee:    row.employee,
      logged_date: row.logged_date,
      hours:       row.hours_final,
      notes:       row.notes || `Imported from timesheet: ${row.task_name}${row.subtask_name ? " / " + row.subtask_name : ""}`,
    });

    inserted.push({ row: row.row_num, log_id: logId });
  }

  return { inserted, skipped };
};

// ── 5. Export enriched rows to .xlsx ─────────────────────────────────────
exports.exportEnriched = async (enrichedRows, runId) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CyberArk Practice Tracker";
  wb.created = new Date();

  // ── Main sheet ──────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Timesheet", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = COLUMNS.map((c) => ({ ...c }));

  // Header
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    cell.font      = { bold: true, color: { argb: COLORS.headerFont }, size: 11 };
    cell.border    = { bottom: { style: "medium", color: { argb: COLORS.accent } } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 28;

  // Data rows — clean, no conflict columns
  enrichedRows.forEach((r, i) => {
    const row = ws.addRow({
      logged_date:  r.logged_date  ?? "",
      employee:     r.employee     ?? "",
      project_name: r.project_name ?? "",
      task_name:    r.task_name    ?? "",
      subtask_name: r.subtask_name ?? "",
      hours_final:  r.hours_final  ?? "",
      status_final: r.status_final ?? "",
      notes:        r.notes        ?? "",
    });

    const bgColor = r.matched ? COLORS.matched : (i % 2 === 0 ? COLORS.baseRow : COLORS.altRow);
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.font = { color: { argb: "FFF1F5F9" } };
    });
  });

  // ── Summary sheet ───────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");
  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 20;

  const totalHours   = enrichedRows.reduce((s, r) => s + (Number(r.hours_final) || 0), 0);
  const matchedCount = enrichedRows.filter((r) => r.matched).length;
  const byEmployee   = {};
  enrichedRows.forEach((r) => {
    if (!r.employee) return;
    byEmployee[r.employee] = (byEmployee[r.employee] || 0) + (Number(r.hours_final) || 0);
  });

  const summaryData = [
    ["CyberArk Practice Tracker — Timesheet Export"],
    ["Generated", new Date().toLocaleString()],
    ["Run ID", runId ?? "—"],
    ["Total Rows", enrichedRows.length],
    ["Matched to DB", matchedCount],
    ["Unmatched", enrichedRows.length - matchedCount],
    ["Total Hours", Math.round(totalHours * 100) / 100],
    [""],
    ["Hours by Employee"],
    ...Object.entries(byEmployee).map(([emp, hrs]) => [emp, Math.round(hrs * 100) / 100]),
  ];

  summaryData.forEach(([label, value], i) => {
    const row = summary.addRow([label, value ?? ""]);
    if (i === 0) row.getCell(1).font = { bold: true, size: 13, color: { argb: COLORS.accent } };
    else if (label === "Hours by Employee") row.getCell(1).font = { bold: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  return buf;
};

// ── Helpers ───────────────────────────────────────────────────────────────
function _cellStr(val) {
  if (val == null) return "";
  if (typeof val === "object" && val.text) return String(val.text).trim();
  if (typeof val === "object" && val.result) return String(val.result).trim();
  return String(val).trim();
}

function _cellNum(val) {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function _normaliseDate(raw) {
  if (!raw) return null;
  // Accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  // Try JS Date parse as fallback
  const d = new Date(raw);
  if (!isNaN(d)) return d.toISOString().split("T")[0];
  return raw;
}

function _matchProject(name, projects) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  // Exact match first
  let match = projects.find(
    (p) => p.project_name.toLowerCase() === lower ||
           p.customer_name.toLowerCase() === lower
  );
  if (match) return match;
  // Partial match
  match = projects.find(
    (p) => p.project_name.toLowerCase().includes(lower) ||
           lower.includes(p.project_name.toLowerCase()) ||
           p.customer_name.toLowerCase().includes(lower) ||
           lower.includes(p.customer_name.toLowerCase())
  );
  return match ?? null;
}

function _matchSubtask(taskName, subtaskName, subtasks, projectId) {
  if (!taskName) return null;
  const tLow = taskName.toLowerCase().trim();
  const sLow = (subtaskName || "").toLowerCase().trim();

  const inProject = subtasks.filter((s) => s.project_id === projectId);

  // Try task + subtask match
  if (sLow) {
    const match = inProject.find(
      (s) => s.group_name.toLowerCase().includes(tLow) &&
             s.subtask_name.toLowerCase().includes(sLow)
    );
    if (match) return match;
  }

  // Task-only match
  return inProject.find((s) => s.group_name.toLowerCase().includes(tLow)) ?? null;
}

// ── 6. Preview conflicts before saving to time_logs ──────────────────────
/**
 * Given enriched rows and the uploading user's session info, compute:
 *   - validRows:     rows that can be saved (employee resolved, required fields present)
 *   - rejectedRows:  rows rejected due to permission (MEMBER uploading for another user)
 *   - newRows:       validRows with no existing time_logs entry
 *   - conflictRows:  validRows that would UPDATE an existing entry
 *
 * Match key: (employee_id, project_name, activity_group, subtask_name, date)
 * On match  → UPDATE hours, status, notes only (employee/project never overwritten).
 *
 * @param {Array}  enrichedRows  — output of enrichRows()
 * @param {object} uploader      — { userId, userRole, userName }
 * @returns {Promise<object>}
 */
exports.previewConflicts = async (enrichedRows, uploader) => {
  const TimeLogModel = require("../models/timeLog.model");
  const isMember = !["ADMIN", "MASTER_ADMIN", "MANAGER"].includes(uploader.userRole ?? "MEMBER");

  const validRows    = [];
  const rejectedRows = [];

  for (const row of enrichedRows) {
    // Resolve employee_id
    const [[user]] = await pool.execute(
      `SELECT id, name FROM users WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1`,
      [row.employee ?? ""]
    );

    if (!user) {
      rejectedRows.push({ ...row, reject_reason: `Employee "${row.employee}" not found in system` });
      continue;
    }

    // Permission check: MEMBERs can only upload for themselves
    if (isMember && user.id !== uploader.userId) {
      rejectedRows.push({
        ...row,
        reject_reason: `Permission denied — you can only upload rows for yourself (found "${row.employee}")`,
      });
      continue;
    }

    // Required fields check
    if (!row.logged_date || !row.hours_final) {
      rejectedRows.push({ ...row, reject_reason: "Missing date or hours" });
      continue;
    }

    validRows.push({
      ...row,
      employee_id:    user.id,
      activity_group: row.task_name    ?? "",
      subtask_name:   row.subtask_name ?? "",
    });
  }

  // Find conflicts in one batch query using the 5-column natural key
  const conflictMap = await TimeLogModel.findConflicts(
    validRows.map((r) => ({
      employee_id:    r.employee_id,
      project_name:   r.project_name   ?? "",
      activity_group: r.activity_group ?? "",
      subtask_name:   r.subtask_name   ?? "",
      date:           r.logged_date,
    }))
  );

  const newRows      = [];
  const conflictRows = [];

  for (const row of validRows) {
    const key = `${row.employee_id}|${row.project_name ?? ""}|${row.activity_group ?? ""}|${row.subtask_name ?? ""}|${row.logged_date}`;
    const conflict = conflictMap.get(key);
    if (conflict) {
      conflictRows.push({ ...row, existing_hours: conflict.existing_hours, existing_source: conflict.existing_source });
    } else {
      newRows.push(row);
    }
  }

  return {
    total:          enrichedRows.length,
    valid:          validRows.length,
    new_count:      newRows.length,
    conflict_count: conflictRows.length,
    rejected_count: rejectedRows.length,
    new_rows:       newRows,
    conflict_rows:  conflictRows,
    rejected_rows:  rejectedRows,
  };
};

// ── 7. Commit enriched rows to time_logs (after user confirms) ────────────
/**
 * Upserts all valid rows (new + conflicts) into time_logs.
 *
 * Match key: (employee_id, project_name, activity_group, subtask_name, date)
 * On match  → UPDATE hours, status, notes only.
 * No match  → INSERT new record.
 * Rejected rows are never written.
 *
 * @param {object} preview  — output of previewConflicts()
 * @returns {Promise<{inserted, updated, rejected, skipped}>}
 */
exports.commitToTimeLogs = async (preview) => {
  const TimeLogModel = require("../models/timeLog.model");

  const rowsToSave = [
    ...preview.new_rows,
    ...preview.conflict_rows,
  ].map((r) => ({
    employee_id:    r.employee_id,
    project_name:   r.project_name   ?? "",
    activity_group: r.activity_group ?? "",
    subtask_name:   r.subtask_name   ?? "",
    date:           r.logged_date,
    hours:          r.hours_final,
    status:         r.status_final   ?? null,
    notes:          r.notes          ?? null,
  }));

  const { inserted, updated } = await TimeLogModel.upsertExcelBatch(rowsToSave);

  return {
    inserted,
    updated,
    rejected: preview.rejected_count,
    skipped:  0, // in-batch duplicates are caught by validateRows before this stage
  };
};

// ── 8. Row-level validation ───────────────────────────────────────────────
/**
 * Validates each parsed row independently. Invalid rows are rejected with a
 * human-readable reason; valid rows in the same file still succeed (partial
 * import is allowed).
 *
 * Checks (in order):
 *   1. DATE        — parseable and produces a valid calendar date
 *   2. EMPLOYEE    — non-empty, exists in users table (case-insensitive)
 *   3. OWNERSHIP   — uploader must match the row's employee unless the
 *                    uploader holds ADMIN or MASTER_ADMIN role
 *   4. PROJECT     — non-empty
 *   5. HOURS       — numeric, > 0, ≤ 24
 *   6. STATUS      — one of the allowed values
 *   7. DUPLICATE   — same (employee + project + task + subtask + date) within
 *                    this upload batch; second occurrence is skipped
 *
 * @param {Array}  parsedRows  — output of parseUpload()
 * @param {object} [uploader]  — { userId, userRole, userName }
 *                               When omitted the ownership check is skipped
 *                               (backwards-compatible for internal callers).
 * @returns {Promise<{results: Array, created_count: number, rejected_count: number}>}
 *   Each element of `results` is either:
 *     { row, status: "valid",    data: <row object> }
 *     { row, status: "rejected", reason: <string>  }
 */
const VALID_STATUSES = new Set([
  "done",
  "in progress",
  "not started",
  "blocked",
  "in testing",
]);

/** Roles that may upload rows on behalf of any employee. */
const PRIVILEGED_ROLES = new Set(["ADMIN", "MASTER_ADMIN"]);

exports.validateRows = async (parsedRows, uploader = null) => {
  // Pre-load all active users once (avoid N+1 per row)
  const [dbUsers] = await pool.execute(
    `SELECT id, name FROM users WHERE deleted_at IS NULL`
  );
  const userMap = new Map(
    dbUsers.map((u) => [u.name.toLowerCase().trim(), u])
  );

  const results       = [];
  let   created_count = 0;
  let   rejected_count = 0;

  // Duplicate-detection set: key = "employee|project|task|subtask|date"
  const seenKeys = new Map(); // key → first row_num

  for (const row of parsedRows) {
    const rowNum = row.row_num;

    // ── 1. Date ────────────────────────────────────────────────────────
    const rawDate = row.logged_date; // already normalised by parseUpload
    if (!rawDate || !_isValidDate(rawDate)) {
      results.push({ row: rowNum, status: "rejected", reason: `Invalid or missing date "${row.logged_date ?? ""}"` });
      rejected_count++;
      continue;
    }

    // ── 2. Employee ────────────────────────────────────────────────────
    const employeeTrimmed = (row.employee ?? "").trim();
    if (!employeeTrimmed) {
      results.push({ row: rowNum, status: "rejected", reason: "Missing employee name" });
      rejected_count++;
      continue;
    }
    const matchedUser = userMap.get(employeeTrimmed.toLowerCase());
    if (!matchedUser) {
      results.push({ row: rowNum, status: "rejected", reason: `Employee "${employeeTrimmed}" not found in system` });
      rejected_count++;
      continue;
    }

    // ── 3. Ownership — uploader must match the row's employee ─────────
    // ADMIN / MASTER_ADMIN may upload for anyone; all other roles are
    // restricted to their own rows.
    if (uploader) {
      const uploaderRole = (uploader.userRole ?? "").toUpperCase();
      if (!PRIVILEGED_ROLES.has(uploaderRole)) {
        const uploaderName = (uploader.userName ?? "").trim().toLowerCase();
        if (uploaderName !== employeeTrimmed.toLowerCase()) {
          results.push({
            row:    rowNum,
            status: "rejected",
            reason: `EMPLOYEE NAME '${employeeTrimmed}' does not match authenticated user '${uploader.userName}'`,
          });
          rejected_count++;
          continue;
        }
      }
    }

    // ── 4. Project ─────────────────────────────────────────────────────
    const projectTrimmed = (row.project_name ?? "").trim();
    if (!projectTrimmed) {
      results.push({ row: rowNum, status: "rejected", reason: "Missing project name" });
      rejected_count++;
      continue;
    }

    // ── 5. Hours ───────────────────────────────────────────────────────
    const hours = row.hours_uploaded;
    if (hours === null || hours === undefined || hours === "") {
      results.push({ row: rowNum, status: "rejected", reason: "Missing hours" });
      rejected_count++;
      continue;
    }
    const hoursNum = Number(hours);
    if (isNaN(hoursNum)) {
      results.push({ row: rowNum, status: "rejected", reason: `Hours "${hours}" is not a number` });
      rejected_count++;
      continue;
    }
    if (hoursNum <= 0) {
      results.push({ row: rowNum, status: "rejected", reason: `Hours ${hoursNum} must be greater than 0` });
      rejected_count++;
      continue;
    }
    if (hoursNum > 24) {
      results.push({ row: rowNum, status: "rejected", reason: `Hours ${hoursNum} exceeds maximum of 24` });
      rejected_count++;
      continue;
    }

    // ── 6. Status ──────────────────────────────────────────────────────
    const statusRaw = (row.status_uploaded ?? "").trim();
    if (statusRaw && !VALID_STATUSES.has(statusRaw.toLowerCase())) {
      results.push({
        row: rowNum,
        status: "rejected",
        reason: `Invalid status "${statusRaw}". Allowed: Done, In Progress, Not Started, Blocked, In Testing`,
      });
      rejected_count++;
      continue;
    }

    // ── 7. Duplicate within this upload ───────────────────────────────
    const dupKey = [
      employeeTrimmed.toLowerCase(),
      projectTrimmed.toLowerCase(),
      (row.task_name    ?? "").trim().toLowerCase(),
      (row.subtask_name ?? "").trim().toLowerCase(),
      rawDate,
    ].join("|");

    if (seenKeys.has(dupKey)) {
      const firstRow = seenKeys.get(dupKey);
      results.push({ row: rowNum, status: "rejected", reason: `Duplicate of row ${firstRow}` });
      rejected_count++;
      continue;
    }
    seenKeys.set(dupKey, rowNum);

    // ── All checks passed ──────────────────────────────────────────────
    results.push({
      row:    rowNum,
      status: "valid",
      data:   {
        ...row,
        employee:     employeeTrimmed,
        employee_id:  matchedUser.id,
        project_name: projectTrimmed,
        hours_final:  hoursNum,
        status_final: statusRaw || "Not Started",
        logged_date:  rawDate,
      },
    });
    created_count++;
  }

  return { results, created_count, rejected_count };
};

// ── 9. Partial import loop ────────────────────────────────────────────────
/**
 * Full single-call import pipeline:
 *   parseUpload → validateRows → enrich valid rows → commit to time_logs
 *
 * Invalid rows are collected and returned; they never block valid rows.
 * In-batch duplicates (same natural key appearing twice in the file) are
 * counted as "skipped" — the first occurrence wins.
 *
 * @param {Buffer} fileBuffer   — raw .xlsx buffer from multer
 * @param {object} uploader     — { userId, userRole, userName }
 * @param {string} filename     — original filename (for audit run)
 * @returns {Promise<object>}   — { run_id, results, summary }
 */
exports.importRows = async (fileBuffer, uploader, filename) => {
  // Step 1 — parse
  const parsed = await exports.parseUpload(fileBuffer);

  // Step 2 — validate (row-level, partial-import aware)
  // validateRows already deduplicates within the batch (seenKeys map).
  // Rows that are duplicates of an earlier row in the same file get
  // status "rejected" with reason "Duplicate of row N" — we surface
  // those as "skipped" in the summary.
  const { results, created_count, rejected_count } = await exports.validateRows(parsed, uploader);

  // Separate in-batch duplicates from hard rejections
  const skippedResults  = results.filter((r) => r.status === "rejected" && r.reason?.startsWith("Duplicate of row"));
  const rejectedResults = results.filter((r) => r.status === "rejected" && !r.reason?.startsWith("Duplicate of row"));
  const skipped_count   = skippedResults.length;
  const hard_rejected   = rejectedResults.length;

  // Step 3 — enrich only the valid rows
  const validRows = results.filter((r) => r.status === "valid").map((r) => r.data);
  const enriched  = validRows.length ? await exports.enrichRows(validRows) : [];

  // Step 4 — permission check + conflict detection
  const preview = enriched.length
    ? await exports.previewConflicts(enriched, uploader)
    : { new_rows: [], conflict_rows: [], rejected_rows: [], rejected_count: 0 };

  // Step 5 — commit to time_logs
  const { inserted, updated } = enriched.length
    ? await exports.commitToTimeLogs(preview)
    : { inserted: 0, updated: 0 };

  // Step 6 — audit run record
  const runId = await TimesheetRunModel.createRun({
    uploaded_by: uploader.userId ?? null,
    filename:    filename || "timesheet_import.xlsx",
    row_count:   parsed.length,
    status:      "processed",
  });
  if (enriched.length) {
    await TimesheetRunModel.insertRows(runId, enriched);
  }

  // Merge permission-rejected rows from previewConflicts back into results
  for (const r of preview.rejected_rows) {
    results.push({
      row:    r.row_num,
      status: "rejected",
      reason: r.reject_reason ?? "Permission denied or missing fields",
    });
  }

  // Build per-row output
  const finalResults = results.map((r) => {
    if (r.status !== "valid") return { row: r.row, status: "rejected", reason: r.reason };
    return { row: r.row, status: "created" };
  });

  // Build rejected_rows detail list for the summary UI
  const rejectedRowDetails = [
    ...rejectedResults.map((r) => ({ row: r.row, reason: r.reason })),
    ...preview.rejected_rows.map((r) => ({ row: r.row_num, reason: r.reject_reason })),
  ];

  return {
    run_id:  runId,
    results: finalResults,
    summary: {
      total:         parsed.length,
      created:       inserted,
      updated,
      rejected:      hard_rejected + (preview.rejected_count ?? 0),
      skipped:       skipped_count,
      inserted,
      rejected_rows: rejectedRowDetails,
    },
  };
};

// ── Helpers (private) ─────────────────────────────────────────────────────
/**
 * Returns true only if `dateStr` is a valid YYYY-MM-DD calendar date.
 * Rejects strings that parse to NaN or produce an invalid calendar date
 * (e.g. 2026-02-30).
 */
function _isValidDate(dateStr) {
  if (!dateStr) return false;
  // Must be YYYY-MM-DD after normalisation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  // Guard against JS silently rolling over (e.g. Feb 30 → Mar 2)
  const [y, m, day] = dateStr.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}
