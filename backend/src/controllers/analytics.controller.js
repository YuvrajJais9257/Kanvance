/**
 * analytics.controller.js
 */
const AnalyticsModel = require("../models/analytics.model");

// GET /api/analytics/summary
exports.summary = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.summary());
  } catch (err) { next(err); }
};

// GET /api/analytics/task-completion
exports.taskCompletion = async (req, res, next) => {
  try {
    const role   = req.session.userRole ?? "MEMBER";
    const userId = req.session.userId;
    // MEMBER only sees projects they are assigned to
    const data = await AnalyticsModel.taskCompletionByProject();
    if (role === "MEMBER") {
      const filtered = data.filter((p) =>
        p.owner_id === userId ||
        // will be further filtered by project visibility — approximate here
        true // full filter is enforced at project level; show their assigned ones
      );
      // Re-use project visibility: only return projects where user is owner or has subtasks
      const pool = require("../config/db");
      const [assigned] = await pool.execute(
        `SELECT DISTINCT ag.project_id FROM subtasks s
         JOIN activity_groups ag ON ag.id = s.group_id
         WHERE s.assignee_id = ?`,
        [userId]
      );
      const assignedIds = new Set(assigned.map((r) => r.project_id));
      return res.json(data.filter((p) => assignedIds.has(p.project_id)));
    }
    res.json(data);
  } catch (err) { next(err); }
};

// GET /api/analytics/team-utilisation
exports.teamUtilisation = async (req, res, next) => {
  try {
    const role   = req.session.userRole ?? "MEMBER";
    const userId = req.session.userId;
    const data   = await AnalyticsModel.teamUtilisation();
    // MEMBER only sees their own row
    if (role === "MEMBER") {
      return res.json(data.filter((u) => u.user_id === userId));
    }
    res.json(data);
  } catch (err) { next(err); }
};

// GET /api/analytics/hours-per-person
exports.hoursPerPerson = async (req, res, next) => {
  try {
    const role   = req.session.userRole ?? "MEMBER";
    const userId = req.session.userId;
    const data   = await AnalyticsModel.hoursPerPersonPerProject();
    if (role === "MEMBER") {
      return res.json(data.filter((r) => r.user_id === userId));
    }
    res.json(data);
  } catch (err) { next(err); }
};

// GET /api/analytics/blocked-tasks
exports.blockedTasks = async (req, res, next) => {
  try {
    const role   = req.session.userRole ?? "MEMBER";
    const userId = req.session.userId;
    const data   = await AnalyticsModel.blockedTasks();
    // MEMBER only sees blocked tasks on their assigned projects
    if (role === "MEMBER") {
      const pool = require("../config/db");
      const [assigned] = await pool.execute(
        `SELECT DISTINCT ag.project_id FROM subtasks s
         JOIN activity_groups ag ON ag.id = s.group_id
         WHERE s.assignee_id = ?`,
        [userId]
      );
      const assignedIds = new Set(assigned.map((r) => r.project_id));
      return res.json(data.filter((b) => assignedIds.has(b.project_id)));
    }
    res.json(data);
  } catch (err) { next(err); }
};

// GET /api/analytics/progress-trend
exports.progressTrend = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.projectProgressTrend());
  } catch (err) { next(err); }
};

// GET /api/analytics/status-breakdown
exports.statusBreakdown = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.subtaskStatusBreakdown());
  } catch (err) { next(err); }
};

// GET /api/analytics/hours-per-day?days=30
exports.hoursPerDay = async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
    res.json(await AnalyticsModel.hoursPerDay(days));
  } catch (err) { next(err); }
};
