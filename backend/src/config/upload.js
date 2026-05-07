/**
 * upload.js — Multer configuration for file uploads
 * Files are stored in /uploads/<customerId>/<timestamp>-<originalname>
 * Allowed: PDF, DOCX, XLSX, PNG, JPG, JPEG, GIF, SVG (max 20 MB)
 */
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");

// Ensure base uploads dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "text/plain",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Organise by customer id if available in route params
    const customerId = req.params.id || req.params.customerId || "misc";
    const dir = path.join(UPLOAD_DIR, String(customerId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .slice(0, 60);
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 400 }), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

module.exports = { upload, UPLOAD_DIR };
