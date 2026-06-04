const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/subtask.controller");
const requireAuth = require("../middlewares/requireAuth");

// GET /api/subtasks/:id/assignment-history
// Must be declared BEFORE /:id routes so Express doesn't swallow
// "assignment-history" as the :id parameter value.
// MANAGER+ authorisation check is performed inside the controller handler.
router.get("/:id/assignment-history", requireAuth, ctrl.assignmentHistory);

// PUT  /api/subtasks/:id
// PATCH /api/subtasks/:id  (alias — same handler)
// Role rules for assignment:
//   ADMIN, LEAD, MANAGER — can assign/reassign to anyone
//   MEMBER               — can update status, due_date, flags on their own tasks
//                          but cannot change assignee_id
router.put("/:id",    ctrl.update);
router.patch("/:id",  ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
