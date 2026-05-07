const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/customer.controller");
const contactCtrl = require("../controllers/contact.controller");
const documentCtrl = require("../controllers/document.controller");
const infraCtrl = require("../controllers/infra.controller");
const upload = require("../middlewares/upload");

router.get("/",     ctrl.getAll);
router.post("/",    ctrl.create);
router.get("/:id",  ctrl.getById);
router.put("/:id",  ctrl.update);

// Nested resources
router.get("/:id/contacts",   contactCtrl.getByCustomer);
router.post("/:id/contacts",  contactCtrl.create);

router.get("/:id/documents",  documentCtrl.getByCustomer);
router.post("/:id/documents", documentCtrl.create);
// File upload endpoint — multipart/form-data
router.post("/:id/documents/upload", upload.single("file"), documentCtrl.upload);

router.get("/:id/infra",      infraCtrl.getByCustomer);
router.post("/:id/infra",     infraCtrl.create);

module.exports = router;
