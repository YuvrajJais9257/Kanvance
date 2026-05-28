/**
 * analytics.routes.js
 * All routes require authentication (enforced by requireAuth in server.js).
 */
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/analytics.controller");

router.get("/summary",          ctrl.summary);
router.get("/task-completion",  ctrl.taskCompletion);
router.get("/team-utilisation", ctrl.teamUtilisation);
router.get("/hours-per-person", ctrl.hoursPerPerson);
router.get("/blocked-tasks",    ctrl.blockedTasks);
router.get("/progress-trend",   ctrl.progressTrend);
router.get("/status-breakdown", ctrl.statusBreakdown);
router.get("/hours-per-day",    ctrl.hoursPerDay);

module.exports = router;
