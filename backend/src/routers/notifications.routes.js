/**
 * notifications.routes.js
 * Deadline notification endpoints
 */
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/notifications.controller");

// All routes require authentication (enforced by requireAuth in server.js)

router.get("/",              ctrl.getNotifications);   // GET  /api/notifications
router.get("/unread-count",  ctrl.getUnreadCount);     // GET  /api/notifications/unread-count
router.get("/critical",      ctrl.getCritical);        // GET  /api/notifications/critical
router.patch("/read-all",    ctrl.markAllAsRead);      // PATCH /api/notifications/read-all
router.patch("/:id/read",    ctrl.markAsRead);         // PATCH /api/notifications/:id/read

module.exports = router;
