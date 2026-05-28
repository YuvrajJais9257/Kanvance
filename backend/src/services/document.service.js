const DocumentModel = require("../models/document.model");
const path = require("path");
const fs   = require("fs");

exports.getByCustomer = (customerId) => DocumentModel.getByCustomer(customerId);

exports.getByEntity = (entityType, entityId) =>
  DocumentModel.getByEntity(entityType, entityId);

exports.getPickerDocs = (customerId) => DocumentModel.getPickerDocs(customerId);

exports.create = (customerId, data) => {
  if (!data.name || !data.name.trim())
    throw Object.assign(new Error("name is required"), { status: 400 });
  return DocumentModel.create(customerId, data);
};

exports.link = (documentId, entityType, entityId) =>
  DocumentModel.link(documentId, entityType, entityId);

exports.unlink = (documentId, entityType, entityId) =>
  DocumentModel.unlink(documentId, entityType, entityId);

// A-7 fix: also delete the physical file if it was an upload
exports.remove = async (id) => {
  const doc = await DocumentModel.getById(id);
  if (doc && doc.link) {
    // Only delete files stored locally (URL contains /uploads/)
    const uploadsMarker = "/uploads/";
    const idx = doc.link.indexOf(uploadsMarker);
    if (idx !== -1) {
      const relativePath = doc.link.slice(idx); // e.g. /uploads/5/1234_file.pdf
      const absPath = path.join(__dirname, "../../", relativePath);
      fs.unlink(absPath, () => {}); // fire-and-forget; ignore errors (file may already be gone)
    }
  }
  return DocumentModel.remove(id);
};
