/**
 * delete.routes.js
 * Hard-delete endpoints for projects and customers (admin-only)
 */
const express      = require("express");
const router       = express.Router();
const ctrl         = require("../controllers/delete.controller");
const requireAdmin = require("../middlewares/requireAdmin");

// All routes require admin access
router.delete("/projects/:id",  requireAdmin, ctrl.deleteProject);
router.delete("/customers/:id", requireAdmin, ctrl.deleteCustomer);
router.get("/audit-trail",      requireAdmin, ctrl.getAuditTrail);

module.exports = router;
