const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/group.controller");
const subtaskCtrl = require("../controllers/subtask.controller");

router.put("/:id",    ctrl.update);
router.delete("/:id", ctrl.remove);

// Subtasks nested under group
router.post("/:gid/subtasks", subtaskCtrl.create);

module.exports = router;
