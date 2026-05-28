const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/auth.controller");
const requireAuth = require("../middlewares/requireAuth");

router.post("/register", ctrl.register);
router.post("/login",    ctrl.login);
router.post("/logout",   requireAuth, ctrl.logout);
router.get("/me",        requireAuth, ctrl.me);

module.exports = router;
