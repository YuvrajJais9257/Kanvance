const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/subtask.controller");

router.put("/:id",    ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
