const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/team.controller");

router.get("/",      ctrl.getAll);
router.post("/",     ctrl.create);
router.delete("/:id", ctrl.remove);

module.exports = router;
