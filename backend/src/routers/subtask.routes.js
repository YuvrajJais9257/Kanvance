const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/subtask.controller");

// PUT /api/subtasks/:id
// Role rules for assignment:
//   ADMIN, LEAD, MANAGER — can assign/reassign to anyone
//   MEMBER               — can update status, due_date, flags on their own tasks
//                          but cannot change assignee_id
router.put("/:id",    ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
