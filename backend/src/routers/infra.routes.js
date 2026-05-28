const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/infra.controller");

// Entity-linked infra
router.get("/entity/:type/:id",    ctrl.getByEntity);
router.get("/picker/:customerId",  ctrl.getPicker);
router.post("/link",               ctrl.linkInfra);
router.post("/unlink",             ctrl.unlinkInfra);  // A-3: POST instead of DELETE with body

// Customer infra (existing)
router.delete("/:id",              ctrl.remove);

module.exports = router;
