/**
 * timesheetEntries.controller.js
 *
 * Handlers for /api/timesheet-entries
 * POST   /            → create
 * GET    /            → list
 * GET    /grid        → grid
 * PUT    /:id         → update
 * DELETE /:id         → remove
 */

const pool = require("../config/db");
const model = require("../models/timesheetEntries.model");
const { getEffectiveRole } = require("../middlewares/requireRole");

// ── Validation helpers ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true when the string is a valid YYYY-MM-DD calendar date
 * (rejects Feb 30, Apr 31, etc.).
 */
function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(str);
}

const VALID_TIME_TYPES = [
  "Billable",
  "Non-billable",
  "Overtime",
  "Holidays",
  "Sick Time",
  "Training",
  "Vacation",
];

/**
 * Validates hours_logged and time_type.
 * Returns an error string or null.
 */
function validateHours(hours_logged, time_type) {
  const h = Number(hours_logged);
  if (!isFinite(h) || h < 0.01 || h > 24.0) {
    return "hours_logged must be between 0.01 and 24.00";
  }
  if (time_type && !VALID_TIME_TYPES.includes(time_type)) {
    return `time_type must be one of: ${VALID_TIME_TYPES.join(", ")}`;
  }
  return null;
}

// ── Role-scoping helper ───────────────────────────────────────────────────

/**
 * Returns the userId to use for scoping queries.
 * MEMBER/MANAGER are always scoped to session user.
 * ADMIN/MASTER_ADMIN may use query param user_id if provided.
 */
function scopedUserId(req) {
  const role = getEffectiveRole(req.session);
  if (role === "ADMIN" || role === "MASTER_ADMIN") {
    const paramId = req.query.user_id;
    if (paramId != null && paramId !== "") return Number(paramId);
  }
  return req.session.userId;
}

// ── create ────────────────────────────────────────────────────────────────

/**
 * POST /api/timesheet-entries
 */
exports.create = async (req, res, next) => {
  try {
    const body = req.body;

    // Reject task_id / project_id in body
    if (body.task_id !== undefined || body.project_id !== undefined) {
      return res.status(400).json({
        error:
          "task_id and project_id must not be included in the request body",
      });
    }

    // Validate hours_logged
    const hours_logged = Number(body.hours_logged);
    if (!isFinite(hours_logged) || hours_logged < 0.01 || hours_logged > 24.0) {
      return res.status(400).json({
        error: "hours_logged must be between 0.01 and 24.00",
      });
    }

    // Validate / default time_type
    const time_type = body.time_type ?? "Billable";
    if (!VALID_TIME_TYPES.includes(time_type)) {
      return res.status(400).json({
        error: `time_type must be one of: ${VALID_TIME_TYPES.join(", ")}`,
      });
    }

    // Validate date
    const { date } = body;
    if (!date || !isValidDate(date)) {
      return res.status(400).json({
        error: "date must be a valid date in YYYY-MM-DD format",
      });
    }

    // Validate remarks
    const remarks = body.remarks ?? null;
    if (remarks !== null && remarks.length > 500) {
      return res.status(400).json({
        error: "remarks must be 500 characters or fewer",
      });
    }

    // subtask_id is required
    const subtaskId = body.subtask_id;
    if (subtaskId == null) {
      return res.status(400).json({ error: "subtask_id is required" });
    }

    // Derive user_id from session only
    const userId = req.session.userId;

    // Check subtask exists
    const [[subtask]] = await pool.execute(
      "SELECT id FROM subtasks WHERE id = ?",
      [subtaskId],
    );
    if (!subtask) {
      return res.status(404).json({ error: "Subtask not found" });
    }

    // Check user is effectively assigned to this subtask.
    // Mirrors the four-branch logic in the grid query exactly:
    //   1. Direct Active_Assignment in task_assignments
    //   2. Task-level inherited: activity_groups.assignee_id = userId
    //   3. Subtask-level: subtasks.assignee_id = userId (legacy column)
    //   4. Project-level fallback: project owner when subtask has no assignee
    const [[assignment]] = await pool.execute(
      `SELECT 1
       FROM subtasks s
       JOIN activity_groups ag ON ag.id = s.group_id
       JOIN projects p         ON p.id  = ag.project_id
       WHERE s.id = ?
         AND (
           -- Branch 1: direct active assignment
           EXISTS (
             SELECT 1 FROM task_assignments ta
             WHERE ta.subtask_id = s.id
               AND ta.user_id = ?
               AND ta.unassigned_date IS NULL
           )
           OR
           -- Branch 2: task-level inherited (ag.assignee_id)
           (
             ag.assignee_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM task_assignments ta2
               WHERE ta2.subtask_id = s.id AND ta2.unassigned_date IS NULL
             )
           )
           OR
           -- Branch 3: subtask-level direct (legacy s.assignee_id)
           (
             s.assignee_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM task_assignments ta3
               WHERE ta3.subtask_id = s.id AND ta3.unassigned_date IS NULL
             )
           )
           OR
           -- Branch 4: project-level fallback (owner, subtask unassigned)
           (
             p.owner_id = ?
             AND s.assignee_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM task_assignments ta4
               WHERE ta4.subtask_id = s.id AND ta4.unassigned_date IS NULL
             )
           )
         )
       LIMIT 1`,
      [subtaskId, userId, userId, userId, userId],
    );
    if (!assignment) {
      return res.status(403).json({
        error: "You are not assigned to this subtask",
      });
    }

    // Daily limit check
    const dailyLimitHours = parseFloat(process.env.DAILY_LIMIT_HOURS) || 8;
    const dailyLimitMode = (
      process.env.DAILY_LIMIT_MODE || "soft"
    ).toLowerCase();

    const dayTotal = await model.dailyTotal(userId, date);

    if (dayTotal + hours_logged > dailyLimitHours) {
      if (dailyLimitMode === "hard") {
        return res.status(422).json({
          error: `Daily total would exceed ${dailyLimitHours}h limit`,
          limit: dailyLimitHours,
        });
      }
      // soft mode: allow insert, attach warning to response
    }

    // Insert
    let entry;
    try {
      entry = await model.create({
        user_id: userId,
        subtask_id: subtaskId,
        date,
        hours_logged,
        time_type,
        remarks,
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          error:
            "A timesheet entry already exists for this user, subtask, and date",
        });
      }
      throw err;
    }

    // Build response — attach daily limit warning if soft mode was triggered
    const responseBody = { ...entry };
    if (dayTotal + hours_logged > dailyLimitHours) {
      responseBody.daily_limit_warning = true;
      responseBody.daily_limit = dailyLimitHours;
    }

    return res.status(201).json(responseBody);
  } catch (err) {
    next(err);
  }
};

// ── list ──────────────────────────────────────────────────────────────────

/**
 * GET /api/timesheet-entries
 */
exports.list = async (req, res, next) => {
  try {
    const userId = scopedUserId(req);

    const entries = await model.list({
      userId,
      dateFrom: req.query.date_from || undefined,
      dateTo: req.query.date_to || undefined,
      subtaskId:
        req.query.subtask_id != null ? Number(req.query.subtask_id) : undefined,
    });

    return res.status(200).json(entries);
  } catch (err) {
    next(err);
  }
};

// ── grid ──────────────────────────────────────────────────────────────────

/**
 * GET /api/timesheet-entries/grid
 *
 * Shapes flat SQL rows into nested:
 * { projects: [ { project_id, project_name, tasks: [ { task_id, task_name, subtasks: [ { subtask_id, subtask_name, entries: [ { entry_id, date, hours_logged, billable_hours } ] } ] } ] } ] }
 */
exports.grid = async (req, res, next) => {
  try {
    const userId = scopedUserId(req);
    const dateFrom = req.query.date_from || undefined;
    const dateTo = req.query.date_to || undefined;

    const rows = await model.grid({ userId, dateFrom, dateTo });

    // Shape flat rows → nested structure
    const projectMap = new Map();

    for (const row of rows) {
      // Project level
      if (!projectMap.has(row.project_id)) {
        projectMap.set(row.project_id, {
          project_id: row.project_id,
          project_name: row.project_name,
          tasks: new Map(),
        });
      }
      const project = projectMap.get(row.project_id);

      // Task level
      if (!project.tasks.has(row.task_id)) {
        project.tasks.set(row.task_id, {
          task_id: row.task_id,
          task_name: row.task_name,
          subtasks: new Map(),
        });
      }
      const task = project.tasks.get(row.task_id);

      // Subtask level
      if (!task.subtasks.has(row.subtask_id)) {
        task.subtasks.set(row.subtask_id, {
          subtask_id: row.subtask_id,
          subtask_name: row.subtask_name,
          entries: [],
        });
      }
      const subtask = task.subtasks.get(row.subtask_id);

      if (row.entry_id != null) {
        subtask.entries.push({
          entry_id: row.entry_id,
          date: row.date,
          hours_logged: row.hours_logged,
          time_type: row.time_type,
          remarks: row.remarks,
        });
      }
    }

    // Convert Maps to arrays for JSON serialisation
    const projects = Array.from(projectMap.values()).map((p) => ({
      ...p,
      tasks: Array.from(p.tasks.values()).map((t) => ({
        ...t,
        subtasks: Array.from(t.subtasks.values()),
      })),
    }));

    return res.status(200).json({ projects });
  } catch (err) {
    next(err);
  }
};

// ── update ────────────────────────────────────────────────────────────────

/**
 * PUT /api/timesheet-entries/:id
 */
exports.update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    // Fetch entry
    const entry = await model.findById(id);
    if (!entry) {
      return res.status(404).json({ error: "Timesheet entry not found" });
    }

    // Ownership or ADMIN/MASTER_ADMIN check
    const role = getEffectiveRole(req.session);
    const isAdmin = role === "ADMIN" || role === "MASTER_ADMIN";
    if (entry.user_id !== req.session.userId && !isAdmin) {
      return res
        .status(403)
        .json({ error: "Forbidden — you do not own this entry" });
    }

    const body = req.body;
    const data = {};

    // Validate hours_logged if provided
    if (body.hours_logged !== undefined) {
      const h = Number(body.hours_logged);
      if (!isFinite(h) || h < 0.01 || h > 24.0) {
        return res.status(400).json({
          error: "hours_logged must be between 0.01 and 24.00",
        });
      }
      data.hours_logged = h;
    }

    // Validate billable_hours if provided — REMOVED (column dropped from DB)

    // Validate time_type if provided
    if (body.time_type !== undefined) {
      if (!VALID_TIME_TYPES.includes(body.time_type)) {
        return res.status(400).json({
          error: `time_type must be one of: ${VALID_TIME_TYPES.join(", ")}`,
        });
      }
      data.time_type = body.time_type;
    }

    // Validate remarks if provided
    if (body.remarks !== undefined) {
      const r = body.remarks;
      if (r !== null && String(r).length > 500) {
        return res.status(400).json({
          error: "remarks must be 500 characters or fewer",
        });
      }
      data.remarks = r;
    }

    const updated = await model.update(id, data);
    return res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
};

// ── remove ────────────────────────────────────────────────────────────────

/**
 * DELETE /api/timesheet-entries/:id
 */
exports.remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    // Fetch entry
    const entry = await model.findById(id);
    if (!entry) {
      return res.status(404).json({ error: "Timesheet entry not found" });
    }

    // Ownership or ADMIN/MASTER_ADMIN check
    const role = getEffectiveRole(req.session);
    const isAdmin = role === "ADMIN" || role === "MASTER_ADMIN";
    if (entry.user_id !== req.session.userId && !isAdmin) {
      return res
        .status(403)
        .json({ error: "Forbidden — you do not own this entry" });
    }

    await model.remove(id);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
};

// ── teamGrid ──────────────────────────────────────────────────────────────

/**
 * GET /api/timesheet-entries/team-grid
 *
 * ADMIN/MASTER_ADMIN: accepts ?user_id= to view any user's grid.
 * MANAGER: accepts ?user_id= but only for users on projects where the manager
 *          is the owner or where the manager is in project_members.
 * MEMBER: always scoped to their own userId, ignores ?user_id=.
 */
exports.teamGrid = async (req, res, next) => {
  try {
    const role = getEffectiveRole(req.session);
    const sessionUserId = req.session.userId;
    let targetUserId = sessionUserId;

    if (req.query.user_id && (role === "ADMIN" || role === "MASTER_ADMIN")) {
      targetUserId = Number(req.query.user_id);
    } else if (req.query.user_id && role === "MANAGER") {
      const requestedId = Number(req.query.user_id);
      // Verify the requested user is on a project managed by this manager
      const [[check]] = await pool.execute(
        `SELECT 1 FROM projects p
         WHERE p.owner_id = ?
         AND EXISTS (
           SELECT 1 FROM task_assignments ta
           JOIN subtasks s ON s.id = ta.subtask_id
           JOIN activity_groups ag ON ag.id = s.group_id
           WHERE ag.project_id = p.id AND ta.user_id = ?
         )
         LIMIT 1`,
        [sessionUserId, requestedId],
      );
      if (check) targetUserId = requestedId;
      // else fall back to own userId
    }

    const dateFrom = req.query.date_from || undefined;
    const dateTo = req.query.date_to || undefined;
    const rows = await model.grid({ userId: targetUserId, dateFrom, dateTo });

    const projectMap = new Map();
    for (const row of rows) {
      if (!projectMap.has(row.project_id)) {
        projectMap.set(row.project_id, {
          project_id: row.project_id,
          project_name: row.project_name,
          tasks: new Map(),
        });
      }
      const project = projectMap.get(row.project_id);
      if (!project.tasks.has(row.task_id)) {
        project.tasks.set(row.task_id, {
          task_id: row.task_id,
          task_name: row.task_name,
          subtasks: new Map(),
        });
      }
      const task = project.tasks.get(row.task_id);
      if (!task.subtasks.has(row.subtask_id)) {
        task.subtasks.set(row.subtask_id, {
          subtask_id: row.subtask_id,
          subtask_name: row.subtask_name,
          entries: [],
        });
      }
      const subtask = task.subtasks.get(row.subtask_id);
      if (row.entry_id != null) {
        subtask.entries.push({
          entry_id: row.entry_id,
          date: row.date,
          hours_logged: row.hours_logged,
          time_type: row.time_type,
        });
      }
    }

    const projects = Array.from(projectMap.values()).map((p) => ({
      ...p,
      tasks: Array.from(p.tasks.values()).map((t) => ({
        ...t,
        subtasks: Array.from(t.subtasks.values()),
      })),
    }));

    return res.status(200).json({ projects, viewed_user_id: targetUserId });
  } catch (err) {
    next(err);
  }
};
