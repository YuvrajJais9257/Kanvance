/**
 * timesheet.controller.js
 */
const TimesheetService  = require("../services/timesheet.service");
const TimesheetRunModel = require("../models/timesheetRun.model");

// GET /api/timesheet/template
exports.downloadTemplate = async (req, res, next) => {
  try {
    const buf = await TimesheetService.generateTemplate();
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",
      'attachment; filename="timesheet_template.xlsx"');
    res.send(buf);
  } catch (err) { next(err); }
};

// POST /api/timesheet/upload  (multipart — field: "file")
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const parsed = await TimesheetService.parseUpload(req.file.buffer);
    res.json({ rows: parsed, row_count: parsed.length });
  } catch (err) { next(err); }
};

// POST /api/timesheet/enrich  body: { rows: [...] }
exports.enrich = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: "rows array is required" });
    }
    const enriched = await TimesheetService.enrichRows(rows);
    res.json({ rows: enriched, row_count: enriched.length });
  } catch (err) { next(err); }
};

// POST /api/timesheet/export  body: { rows: [...], filename?: "..." }
exports.exportExcel = async (req, res, next) => {
  try {
    const { rows, filename } = req.body;
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: "rows array is required" });
    }

    // Save audit run
    const runId = await TimesheetRunModel.createRun({
      uploaded_by: req.session.userId,
      filename:    filename || "timesheet_export.xlsx",
      row_count:   rows.length,
      status:      "processed",
    });
    await TimesheetRunModel.insertRows(runId, rows);

    const buf = await TimesheetService.exportEnriched(rows, runId);
    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",
      `attachment; filename="${filename || "timesheet_enriched.xlsx"}"`);
    res.send(buf);
  } catch (err) { next(err); }
};

// GET /api/timesheet/runs
exports.listRuns = async (req, res, next) => {
  try {
    const runs = await TimesheetRunModel.listRuns(Number(req.query.limit) || 20);
    res.json(runs);
  } catch (err) { next(err); }
};

// GET /api/timesheet/runs/:id/rows
exports.getRunRows = async (req, res, next) => {
  try {
    const rows = await TimesheetRunModel.getRows(req.params.id);
    res.json(rows);
  } catch (err) { next(err); }
};
