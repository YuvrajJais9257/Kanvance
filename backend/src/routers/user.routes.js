/**
 * user.routes.js
 *
 * Role hierarchy: ADMIN > LEAD > MANAGER > MEMBER
 *
 * RBAC rules:
 *   GET  /api/users          — ADMIN, LEAD, MANAGER (list all — needed for assignee pickers)
 *   GET  /api/users/:id      — any authenticated user (MEMBER sees own only — enforced in controller)
 *   POST /api/users          — ADMIN only
 *   PATCH /api/users/:id     — ADMIN (any), MANAGER/MEMBER (own only — enforced in controller)
 *   PATCH /api/users/:id/deactivate — ADMIN only
 *   DELETE /api/users/:id    — ADMIN only
 */
const express      = require("express");
const router       = express.Router();
const ctrl         = require("../controllers/user.controller");
const requireRole  = require("../middlewares/requireRole");

router.get("/",                          requireRole("ADMIN", "LEAD", "MANAGER"), ctrl.getAll);
router.get("/:id",                       ctrl.getById);
router.post("/",                         requireRole("ADMIN"),    ctrl.create);
router.patch("/:id",                     ctrl.update);
router.patch("/:id/deactivate",          requireRole("ADMIN"),    ctrl.deactivate);
router.delete("/:id",                    requireRole("ADMIN"),    ctrl.remove);

module.exports = router;
