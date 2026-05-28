const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/contact.controller");

router.delete("/:id", ctrl.remove);

module.exports = router;
