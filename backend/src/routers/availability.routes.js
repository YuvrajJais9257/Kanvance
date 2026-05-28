const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/availability.controller");

router.get("/",  ctrl.getAll);
router.put("/",  ctrl.updateOwn);

module.exports = router;
