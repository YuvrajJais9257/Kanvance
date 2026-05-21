/**
 * activityLog.routes.js
 * Routes for daily activity logging
 */
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/activityLog.controller");

// All routes require authentication (enforced by requireAuth in server.js)

// My activity logs
router.post("/",           ctrl.create);         // Log new activity
router.get("/me",          ctrl.getMyLogs);      // Get my logs
router.get("/summary",     ctrl.getMySummary);   // Get my summary stats

// Manage specific log entry
router.put("/:id",         ctrl.update);         // Update log entry
router.delete("/:id",      ctrl.remove);         // Delete log entry

// View other users' logs (admins/managers only)
router.get("/user/:userId", ctrl.getUserLogs);   // Get user's logs

module.exports = router;
