/**
 * timesheetEntries.routes.js
 * All routes require authentication (enforced by requireAuth in server.js).
 */
const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/timesheetEntries.controller");

router.post("/",            ctrl.create);
router.get("/",             ctrl.list);
router.get("/grid",         ctrl.grid);
router.get("/team-grid",    ctrl.teamGrid);
router.put("/:id",          ctrl.update);
router.delete("/:id",       ctrl.remove);

module.exports = router;
