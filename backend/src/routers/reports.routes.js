/**
 * reports.routes.js
 * Team reporting routes (managers and admins only)
 */
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/reports.controller");
const requireRole = require("../middlewares/requireRole");

const adminOnly = requireRole("ADMIN", "MASTER_ADMIN");

// All routes require authentication (enforced by requireAuth in server.js)

// Get accessible users/projects for dropdowns
router.get("/accessible-users",    ctrl.getAccessibleUsers);
router.get("/accessible-projects", ctrl.getAccessibleProjects);

// Generate and download reports
router.post("/generate",           ctrl.generate);

// Save enriched timesheet rows to activity_logs (legacy — powers Analytics → Team Utilisation)
router.post("/save-hours",         ctrl.saveHours);

// time_logs pipeline (new)
// Step 1: dry-run preview — resolve employees, check permissions, find conflicts
router.post("/preview-time-logs",  ctrl.previewTimeLogs);
// Step 2: commit after user confirms
router.post("/commit-time-logs",   ctrl.commitTimeLogs);

// Admin-only analytics endpoints
router.get("/effort-variance", adminOnly, ctrl.effortVariance);
router.get("/user-effort",     adminOnly, ctrl.userEffort);

module.exports = router;
