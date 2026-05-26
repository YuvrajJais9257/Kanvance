/**
 * timesheet.routes.js
 * All routes require authentication (enforced by requireAuth in server.js).
 */
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const ctrl     = require("../controllers/timesheet.controller");

// Store upload in memory (buffer) — no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.originalname.endsWith(".xlsx")) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Only .xlsx files are accepted"), { status: 400 }));
    }
  },
});

router.get("/template",          ctrl.downloadTemplate);
router.post("/upload",           upload.single("file"), ctrl.upload);
router.post("/validate",         ctrl.validateRows);                    // Phase 2: row-level validation (no DB writes)
router.post("/import",           upload.single("file"), ctrl.importFile); // Phase 2: full partial-import pipeline
router.post("/enrich",           ctrl.enrich);
router.post("/sync",             ctrl.sync);
router.post("/export",           ctrl.exportExcel);
router.get("/runs",              ctrl.listRuns);
router.get("/runs/:id/rows",     ctrl.getRunRows);

module.exports = router;
