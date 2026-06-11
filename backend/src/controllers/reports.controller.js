/**
 * reports.controller.js
 * Team reporting for managers and admins
 */
const pool = require("../config/db");
const ExcelJS = require("exceljs");
const TimesheetService = require("../services/timesheet.service");

// GET /api/reports/accessible-users — Get users the current user can report on
exports.getAccessibleUsers = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole || "MEMBER";
    const privilegeLevel = req.session.privilegeLevel || "MEMBER";

    let users = [];

    if (privilegeLevel === "MASTER_ADMIN" || privilegeLevel === "ADMIN") {
      // Admins see all users
      const [rows] = await pool.execute(
        `SELECT id, name, role, email
         FROM users
         WHERE deleted_at IS NULL AND status = 'active'
         ORDER BY name ASC`
      );
      users = rows;
    } else if (privilegeLevel === "MANAGER") {
      // Managers see users in their projects
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.name, u.role, u.email
         FROM users u
         JOIN subtasks s ON s.assignee_id = u.id
         JOIN activity_groups ag ON ag.id = s.group_id
         JOIN projects p ON p.id = ag.project_id
         WHERE p.owner_id = ?
           AND u.deleted_at IS NULL 
           AND u.status = 'active'
         ORDER BY u.name ASC`,
        [userId]
      );
      users = rows;
    } else {
      // Members can only see themselves
      const [[row]] = await pool.execute(
        `SELECT id, name, role, email
         FROM users
         WHERE id = ? AND deleted_at IS NULL`,
        [userId]
      );
      if (row) users = [row];
    }

    res.json(users);
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/accessible-projects — Get projects the current user can report on
exports.getAccessibleProjects = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const privilegeLevel = req.session.privilegeLevel || "MEMBER";

    let projects = [];

    if (privilegeLevel === "MASTER_ADMIN" || privilegeLevel === "ADMIN") {
      // Admins see all projects
      const [rows] = await pool.execute(
        `SELECT p.id, p.name, c.name AS customer_name, p.type, p.status
         FROM projects p
         JOIN customers c ON c.id = p.customer_id
         ORDER BY c.name ASC, p.name ASC`
      );
      projects = rows;
    } else if (privilegeLevel === "MANAGER") {
      // Managers see their own projects
      const [rows] = await pool.execute(
        `SELECT p.id, p.name, c.name AS customer_name, p.type, p.status
         FROM projects p
         JOIN customers c ON c.id = p.customer_id
         WHERE p.owner_id = ?
         ORDER BY c.name ASC, p.name ASC`,
        [userId]
      );
      projects = rows;
    } else {
      // Members see projects they're assigned to
      const [rows] = await pool.execute(
        `SELECT DISTINCT p.id, p.name, c.name AS customer_name, p.type, p.status
         FROM projects p
         JOIN customers c ON c.id = p.customer_id
         JOIN activity_groups ag ON ag.project_id = p.id
         JOIN subtasks s ON s.group_id = ag.id
         WHERE s.assignee_id = ? OR (s.assignee_id IS NULL AND p.owner_id = ?)
         ORDER BY c.name ASC, p.name ASC`,
        [userId, userId]
      );
      projects = rows;
    }

    res.json(projects);
  } catch (err) {
    next(err);
  }
};

// POST /api/reports/generate — Generate and download a team report
exports.generate = async (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const privilegeLevel = req.session.privilegeLevel || "MEMBER";
    const { report_type, date_range, user_ids, project_ids, format } = req.body;

    // Members cannot generate team reports
    if (privilegeLevel === "MEMBER") {
      return res.status(403).json({ 
        error: "You don't have permission to generate team reports" 
      });
    }

    // Validate inputs
    if (!report_type || !date_range) {
      return res.status(400).json({ 
        error: "Missing required fields: report_type, date_range" 
      });
    }

    const { start, end } = date_range;
    if (!start || !end) {
      return res.status(400).json({ 
        error: "date_range must include start and end dates" 
      });
    }

    // Build filters
    let userFilter = "";
    let projectFilter = "";
    const params = [start, end];

    if (user_ids && user_ids.length > 0) {
      userFilter = `AND al.user_id IN (${user_ids.map(() => "?").join(",")})`;
      params.push(...user_ids);
    }

    if (project_ids && project_ids.length > 0) {
      projectFilter = `AND al.project_id IN (${project_ids.map(() => "?").join(",")})`;
      params.push(...project_ids);
    }

    // Generate report based on type
    let data = [];
    let reportName = "";

    switch (report_type) {
      case "user_activity":
        reportName = "User Activity Report";
        [data] = await pool.execute(
          `SELECT 
             al.logged_date AS date,
             u.name AS user,
             p.name AS project,
             c.name AS customer,
             ag.name AS task,
             s.name AS subtask,
             al.hours,
             s.status,
             al.notes
           FROM activity_logs al
           JOIN users u ON u.id = al.user_id
           JOIN projects p ON p.id = al.project_id
           JOIN customers c ON c.id = p.customer_id
           LEFT JOIN subtasks s ON s.id = al.subtask_id
           LEFT JOIN activity_groups ag ON ag.id = s.group_id
           WHERE al.logged_date BETWEEN ? AND ?
             ${userFilter}
             ${projectFilter}
           ORDER BY u.name ASC, al.logged_date DESC`,
          params
        );
        break;

      case "project_hours":
        reportName = "Project Hours Report";
        [data] = await pool.execute(
          `SELECT 
             p.name AS project,
             c.name AS customer,
             u.name AS user,
             ROUND(SUM(al.hours), 1) AS total_hours,
             COUNT(DISTINCT s.id) AS tasks_completed,
             COUNT(DISTINCT CASE WHEN s.status = 'In Progress' THEN s.id END) AS tasks_in_progress,
             ROUND(
               SUM(CASE WHEN s.status = 'Done' THEN 1 ELSE 0 END) / 
               NULLIF(COUNT(DISTINCT s.id), 0) * 100, 
               1
             ) AS completion_pct
           FROM activity_logs al
           JOIN users u ON u.id = al.user_id
           JOIN projects p ON p.id = al.project_id
           JOIN customers c ON c.id = p.customer_id
           LEFT JOIN subtasks s ON s.id = al.subtask_id
           WHERE al.logged_date BETWEEN ? AND ?
             ${userFilter}
             ${projectFilter}
           GROUP BY p.id, u.id
           ORDER BY p.name ASC, total_hours DESC`,
          params
        );
        break;

      case "team_utilization":
        reportName = "Team Utilization Report";
        [data] = await pool.execute(
          `SELECT 
             u.name AS user,
             u.role,
             ROUND(SUM(al.hours), 1) AS total_hours,
             COUNT(DISTINCT al.project_id) AS projects_worked,
             COUNT(DISTINCT al.logged_date) AS days_logged,
             ROUND(SUM(al.hours) / NULLIF(COUNT(DISTINCT al.logged_date), 0), 1) AS avg_hours_per_day,
             COUNT(DISTINCT CASE WHEN s.status = 'Done' THEN s.id END) AS tasks_completed,
             ROUND(
               SUM(al.hours) / NULLIF(
                 (SELECT SUM(hours) FROM activity_logs WHERE logged_date BETWEEN ? AND ?), 
                 0
               ) * 100, 
               1
             ) AS utilization_pct
           FROM activity_logs al
           JOIN users u ON u.id = al.user_id
           LEFT JOIN subtasks s ON s.id = al.subtask_id
           WHERE al.logged_date BETWEEN ? AND ?
             ${userFilter}
             ${projectFilter}
           GROUP BY u.id
           ORDER BY total_hours DESC`,
          [start, end, start, end, ...params.slice(2)]
        );
        break;

      case "timesheet_export":
        reportName = "Timesheet Export";
        [data] = await pool.execute(
          `SELECT 
             al.logged_date AS date,
             u.name AS employee,
             p.name AS project,
             ag.name AS task,
             s.name AS subtask,
             al.hours,
             s.status,
             al.notes
           FROM activity_logs al
           JOIN users u ON u.id = al.user_id
           JOIN projects p ON p.id = al.project_id
           LEFT JOIN subtasks s ON s.id = al.subtask_id
           LEFT JOIN activity_groups ag ON ag.id = s.group_id
           WHERE al.logged_date BETWEEN ? AND ?
             ${userFilter}
             ${projectFilter}
           ORDER BY al.logged_date DESC, u.name ASC`,
          params
        );
        break;

      case "effort_variance":
        reportName = "Effort Variance Report";
        data = await queryEffortVariance(
          project_ids && project_ids.length === 1 ? project_ids[0] : null,
          start,
          end
        );
        break;

      default:
        return res.status(400).json({ error: "Invalid report_type" });
    }

    // Generate Excel file
    if (format === "excel" || !format) {
      const buffer = await generateExcelReport(reportName, data, date_range);
      res.setHeader("Content-Type", 
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 
        `attachment; filename="${reportName.replace(/ /g, "_")}_${start}_to_${end}.xlsx"`);
      res.send(buffer);
    } else if (format === "json") {
      res.json({ report_name: reportName, date_range, data });
    } else {
      return res.status(400).json({ error: "Unsupported format. Use 'excel' or 'json'" });
    }
  } catch (err) {
    next(err);
  }
};

// Helper: Generate Excel report
async function generateExcelReport(reportName, data, dateRange) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EraDesk";
  wb.created = new Date();

  const ws = wb.addWorksheet(reportName);

  if (data.length === 0) {
    ws.addRow(["No data found for the selected criteria"]);
    return await wb.xlsx.writeBuffer();
  }

  // Add headers
  const headers = Object.keys(data[0]);
  ws.columns = headers.map(h => ({
    header: h.replace(/_/g, " ").toUpperCase(),
    key: h,
    width: 20
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.font = { bold: true, color: { argb: "FFF1F5F9" }, size: 11 };
    cell.border = { bottom: { style: "medium", color: { argb: "FF6366F1" } } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 28;

  // Add data rows
  data.forEach((row, i) => {
    const excelRow = ws.addRow(row);
    const bgColor = i % 2 === 0 ? "FF1E293B" : "FF0F172A";
    excelRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.font = { color: { argb: "FFF1F5F9" } };
    });
  });

  // Add summary sheet
  const summary = wb.addWorksheet("Summary");
  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 20;

  const totalHours = data.reduce((sum, row) => sum + (Number(row.hours || row.total_hours) || 0), 0);
  const uniqueUsers = new Set(data.map(row => row.user || row.employee)).size;
  const uniqueProjects = new Set(data.map(row => row.project)).size;

  const summaryData = [
    [reportName],
    ["Generated", new Date().toLocaleString()],
    ["Date Range", `${dateRange.start} to ${dateRange.end}`],
    ["Total Rows", data.length],
    ["Total Hours", Math.round(totalHours * 10) / 10],
    ["Unique Users", uniqueUsers],
    ["Unique Projects", uniqueProjects],
  ];

  summaryData.forEach(([label, value], i) => {
    const row = summary.addRow([label, value ?? ""]);
    if (i === 0) row.getCell(1).font = { bold: true, size: 13, color: { argb: "FF6366F1" } };
  });

  return await wb.xlsx.writeBuffer();
}

// POST /api/reports/save-hours — Persist enriched timesheet rows into activity_logs
// This powers the Analytics → Team Utilisation view.
exports.saveHours = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: "rows array is required" });
    }

    const result = await TimesheetService.syncToActivityLogs(rows);

    res.json({
      message: `Saved ${result.inserted.length} row(s). ${result.skipped.length} skipped (already exist).`,
      inserted: result.inserted.length,
      skipped:  result.skipped.length,
      details:  result,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/reports/preview-time-logs
// Dry-run: resolve employees, check permissions, find conflicts.
// Returns a preview object the frontend shows before the user confirms.
exports.previewTimeLogs = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: "rows array is required" });
    }

    const uploader = {
      userId:   req.session.userId,
      userRole: req.session.privilegeLevel || req.session.userRole || "MEMBER",
      userName: req.session.userName,
    };

    const preview = await TimesheetService.previewConflicts(rows, uploader);
    res.json(preview);
  } catch (err) {
    next(err);
  }
};

// POST /api/reports/commit-time-logs
// Commits a previously-previewed batch to time_logs.
// The client sends the full preview object back so we don't need to re-compute.
exports.commitTimeLogs = async (req, res, next) => {
  try {
    const { preview } = req.body;
    if (!preview || typeof preview !== "object") {
      return res.status(400).json({ error: "preview object is required" });
    }
    if (!Array.isArray(preview.new_rows) || !Array.isArray(preview.conflict_rows)) {
      return res.status(400).json({ error: "preview must contain new_rows and conflict_rows arrays" });
    }

    const result = await TimesheetService.commitToTimeLogs(preview);

    // Build rejected_rows detail list from the preview's rejected_rows
    const rejectedRowDetails = (preview.rejected_rows ?? []).map((r) => ({
      row:    r.row_num,
      reason: r.reject_reason ?? "Rejected",
    }));

    res.json({
      message:       `Import complete — ${result.inserted} created, ${result.updated} updated, ${result.rejected} rejected`,
      created:       result.inserted,
      updated:       result.updated,
      rejected:      result.rejected,
      skipped:       result.skipped ?? 0,
      rejected_rows: rejectedRowDetails,
    });
  } catch (err) {
    next(err);
  }
};

// ── Internal query helpers ────────────────────────────────────────────────

/**
 * Query per-project effort variance data.
 * @param {number|null} projectId  Optional project filter
 * @param {string|null} dateStart  Optional date range start (YYYY-MM-DD)
 * @param {string|null} dateEnd    Optional date range end (YYYY-MM-DD)
 */
async function queryEffortVariance(projectId, dateStart, dateEnd) {
  const conditions = [];
  const params = [];

  if (projectId != null) {
    conditions.push("p.id = ?");
    params.push(projectId);
  }
  if (dateStart && dateEnd) {
    conditions.push("te.date BETWEEN ? AND ?");
    params.push(dateStart, dateEnd);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `SELECT
       p.id                                                          AS project_id,
       p.name                                                        AS project_name,
       COALESCE(p.estimated_hours, 0)                                AS estimated_hours,
       ROUND(COALESCE(SUM(te.hours_logged),  0), 2)                  AS actual_hours,
       ROUND(COALESCE(SUM(CASE WHEN te.time_type = 'Billable' THEN te.hours_logged ELSE 0 END), 0), 2) AS billable_hours,
       ROUND(COALESCE(SUM(te.hours_logged),  0) -
             COALESCE(p.estimated_hours, 0),                      2) AS variance
     FROM projects p
     LEFT JOIN activity_groups ag ON ag.project_id = p.id
     LEFT JOIN subtasks s         ON s.group_id    = ag.id
     LEFT JOIN timesheet_entries te ON te.subtask_id = s.id
     ${where}
     GROUP BY p.id
     ORDER BY p.name ASC`,
    params
  );

  return rows.map((row) => ({
    ...row,
    variance_label:
      Number(row.variance) < 0 ? "Under Estimate" :
      Number(row.variance) > 0 ? "Over Estimate"  : "On Track",
  }));
}

/**
 * Query per-user effort summary.
 */
async function queryUserEffort() {
  const [rows] = await pool.execute(
    `SELECT
       u.id                                                          AS user_id,
       u.name                                                        AS user_name,
       ROUND(COALESCE(SUM(te.hours_logged),   0), 2)                 AS total_hours_logged,
       ROUND(COALESCE(SUM(CASE WHEN te.time_type = 'Billable' THEN te.hours_logged ELSE 0 END), 0), 2) AS total_billable_hours,
       ROUND(
         COALESCE(SUM(CASE WHEN te.time_type = 'Billable' THEN te.hours_logged ELSE 0 END), 0) /
         NULLIF(COALESCE(SUM(te.hours_logged), 0), 0) * 100
       , 1)                                                          AS utilization_pct,
       COUNT(DISTINCT ag.project_id)                                 AS projects_contributed
     FROM users u
     LEFT JOIN timesheet_entries te ON te.user_id = u.id
     LEFT JOIN subtasks s           ON s.id = te.subtask_id
     LEFT JOIN activity_groups ag   ON ag.id = s.group_id
     WHERE u.deleted_at IS NULL AND u.status = 'active'
     GROUP BY u.id
     ORDER BY total_hours_logged DESC`
  );
  return rows;
}

// GET /api/reports/effort-variance
exports.effortVariance = async (req, res, next) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;

    // 404 if project_id provided but project doesn't exist
    if (projectId != null) {
      const [[project]] = await pool.execute(
        "SELECT id FROM projects WHERE id = ?",
        [projectId]
      );
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
    }

    const data = await queryEffortVariance(projectId, null, null);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/user-effort
exports.userEffort = async (req, res, next) => {
  try {
    const data = await queryUserEffort();
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = exports;
