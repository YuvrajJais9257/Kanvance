const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/project.controller");
const groupCtrl = require("../controllers/group.controller");

router.get("/",      ctrl.getAll);
router.post("/",     ctrl.create);
router.get("/:id",   ctrl.getById);
router.put("/:id",   ctrl.update);
router.delete("/:id", ctrl.remove);

// Activity groups nested under project
router.post("/:pid/groups", groupCtrl.create);

module.exports = router;
