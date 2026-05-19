const express      = require("express");
const router       = express.Router();
const ctrl         = require("../controllers/team.controller");
const requireRole  = require("../middlewares/requireRole");

router.get("/",       ctrl.getAll);
router.post("/",      requireRole("ADMIN"), ctrl.create);
router.delete("/:id", requireRole("ADMIN"), ctrl.remove);

module.exports = router;
