/**
 * analytics.routes.js
 * All routes require authentication (enforced by requireAuth in server.js).
 * Analytics routes are restricted to ADMIN and MASTER_ADMIN roles.
 */
const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/analytics.controller");
const requireRole = require("../middlewares/requireRole");

const adminOnly = requireRole("ADMIN", "MASTER_ADMIN");

router.get("/summary",          adminOnly, ctrl.summary);
router.get("/task-completion",  adminOnly, ctrl.taskCompletion);
router.get("/team-utilisation", adminOnly, ctrl.teamUtilisation);
router.get("/user-tasks",       adminOnly, ctrl.userTasks);
router.get("/hours-per-person", adminOnly, ctrl.hoursPerPerson);
router.get("/blocked-tasks",    adminOnly, ctrl.blockedTasks);
router.get("/progress-trend",   adminOnly, ctrl.progressTrend);
router.get("/status-breakdown", adminOnly, ctrl.statusBreakdown);
router.get("/hours-per-day",    adminOnly, ctrl.hoursPerDay);
router.get("/start-delay",      adminOnly, ctrl.startDelay);

module.exports = router;
