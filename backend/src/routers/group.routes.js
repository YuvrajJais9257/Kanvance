const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/group.controller");
const subtaskCtrl = require("../controllers/subtask.controller");

router.put("/:id",    ctrl.update);
router.delete("/:id", ctrl.remove);

// Subtasks nested under group
router.post("/:gid/subtasks", subtaskCtrl.create);

// Assignment routes (requireAuth is applied globally; manager-level check is in the controller)
router.post("/:taskId/bulk-assign", ctrl.bulkAssign);
router.post("/:taskId/distribute",  ctrl.distribute);

module.exports = router;
