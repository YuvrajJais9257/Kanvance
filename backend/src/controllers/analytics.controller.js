/**
 * analytics.controller.js
 */
const AnalyticsModel = require("../models/analytics.model");
const { getEffectiveRole } = require("../middlewares/requireRole");

// GET /api/analytics/summary
exports.summary = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.summary());
  } catch (err) { next(err); }
};

// GET /api/analytics/task-completion
exports.taskCompletion = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.taskCompletionByProject());
  } catch (err) { next(err); }
};

// GET /api/analytics/team-utilisation
exports.teamUtilisation = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.teamUtilisation());
  } catch (err) { next(err); }
};

// GET /api/analytics/user-tasks
exports.userTasks = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.userTasksDetail());
  } catch (err) { next(err); }
};

// GET /api/analytics/hours-per-person
exports.hoursPerPerson = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.hoursPerPersonPerProject());
  } catch (err) { next(err); }
};

// GET /api/analytics/blocked-tasks
exports.blockedTasks = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.blockedTasks());
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

// GET /api/analytics/start-delay
exports.startDelay = async (req, res, next) => {
  try {
    res.json(await AnalyticsModel.startDelayByUser());
  } catch (err) { next(err); }
};
