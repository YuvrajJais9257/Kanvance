const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/document.controller");

// Entity-linked documents
router.get("/entity/:type/:id",    ctrl.getByEntity);
router.get("/picker/:customerId",  ctrl.getPicker);
router.post("/link",               ctrl.linkDoc);
router.post("/unlink",             ctrl.unlinkDoc);  // A-3: POST instead of DELETE with body

// Customer documents (existing)
router.delete("/:id",              ctrl.remove);

module.exports = router;
