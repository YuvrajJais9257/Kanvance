/**
 * userGroup.routes.js
 *
 * RBAC:
 *   GET  /api/user-groups          — any authenticated user (to populate pickers)
 *   GET  /api/user-groups/:id      — any authenticated user
 *   GET  /api/user-groups/:id/members — ADMIN only
 *   POST /api/user-groups          — ADMIN only
 *   PATCH /api/user-groups/:id     — ADMIN only
 *   DELETE /api/user-groups/:id    — ADMIN only
 *   POST /api/user-groups/:id/assign — ADMIN only
 */
const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/userGroup.controller");
const requireRole = require("../middlewares/requireRole");

router.get("/",                    ctrl.getAll);
router.get("/:id",                 ctrl.getById);
router.get("/:id/members",         requireRole("ADMIN"), ctrl.getMembers);
router.post("/",                   requireRole("ADMIN"), ctrl.create);
router.patch("/:id",               requireRole("ADMIN"), ctrl.update);
router.delete("/:id",              requireRole("ADMIN"), ctrl.remove);
router.post("/:id/assign",         requireRole("ADMIN"), ctrl.assignUser);

module.exports = router;
