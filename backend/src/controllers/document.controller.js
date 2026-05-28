const DocumentService = require("../services/document.service");
const path = require("path");

exports.getByCustomer = async (req, res, next) => {
  try {
    res.json(await DocumentService.getByCustomer(req.params.id));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const result = await DocumentService.create(req.params.id, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
};

// POST /api/customers/:id/documents/upload  — multipart file upload
// Multer is applied in the router, not here, so req.file is already populated.
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }

    const customerId = req.params.id;
    const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

    // Build a publicly accessible URL for the uploaded file
    const relativePath = `/uploads/${customerId}/${req.file.filename}`;
    const fileUrl = `${BACKEND_URL}${relativePath}`;

    // Derive document type from extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    const typeMap = {
      ".pdf":  "SOP",
      ".doc":  "LLD",
      ".docx": "LLD",
      ".xls":  "Infra Sheet",
      ".xlsx": "Infra Sheet",
      ".png":  "Architecture Diagram",
      ".jpg":  "Architecture Diagram",
      ".jpeg": "Architecture Diagram",
      ".svg":  "Architecture Diagram",
    };
    const docType = typeMap[ext] ?? "Other";

    // Use provided name or fall back to original filename
    const name = (req.body.name || req.file.originalname).trim();

    const result = await DocumentService.create(customerId, {
      name,
      type:   req.body.type   || docType,
      status: req.body.status || "Draft",
      link:   fileUrl,
      notes:  req.body.notes  || null,
    });

    res.status(201).json({
      id:       result.insertId,
      name,
      link:     fileUrl,
      filename: req.file.filename,
      size:     req.file.size,
    });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await DocumentService.remove(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

// GET /api/documents/entity/:type/:id
exports.getByEntity = async (req, res, next) => {
  try {
    const { type, id } = req.params;
    if (!["project", "group", "subtask"].includes(type)) {
      return res.status(400).json({ error: "entity type must be project, group, or subtask" });
    }
    res.json(await DocumentService.getByEntity(type, id));
  } catch (err) { next(err); }
};

// GET /api/documents/picker/:customerId
exports.getPicker = async (req, res, next) => {
  try {
    res.json(await DocumentService.getPickerDocs(req.params.customerId));
  } catch (err) { next(err); }
};

// POST /api/documents/link
exports.linkDoc = async (req, res, next) => {
  try {
    const { document_id, entity_type, entity_id } = req.body;
    if (!document_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: "document_id, entity_type, entity_id are required" });
    }
    if (!["project", "group", "subtask"].includes(entity_type)) {
      return res.status(400).json({ error: "entity_type must be project, group, or subtask" });
    }
    // A-4: validate ids are positive integers
    const docId = parseInt(document_id, 10);
    const entId = parseInt(entity_id, 10);
    if (!docId || docId <= 0 || !entId || entId <= 0) {
      return res.status(400).json({ error: "document_id and entity_id must be positive integers" });
    }
    await DocumentService.link(docId, entity_type, entId);
    res.status(201).json({ linked: true });
  } catch (err) { next(err); }
};

// POST /api/documents/unlink  (A-3: was DELETE with body — changed to POST for proxy compatibility)
exports.unlinkDoc = async (req, res, next) => {
  try {
    const { document_id, entity_type, entity_id } = req.body;
    if (!document_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: "document_id, entity_type, entity_id are required" });
    }
    const docId = parseInt(document_id, 10);
    const entId = parseInt(entity_id, 10);
    if (!docId || docId <= 0 || !entId || entId <= 0) {
      return res.status(400).json({ error: "document_id and entity_id must be positive integers" });
    }
    await DocumentService.unlink(docId, entity_type, entId);
    res.json({ unlinked: true });
  } catch (err) { next(err); }
};
