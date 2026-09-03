import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AGREEMENTS_DIR = path.join(__dirname, "..", "..", "uploads", "agreements");

fs.mkdirSync(AGREEMENTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AGREEMENTS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".pdf";
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (file.mimetype !== "application/pdf") {
    return cb(new Error("Only PDF files are accepted"));
  }
  cb(null, true);
}

export const uploadAgreement = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Profile photo / passport upload — separate directory, image-only, served
// back out statically (see server.js) so <img src> can point straight at it.
export const PHOTOS_DIR = path.join(__dirname, "..", "..", "uploads", "photos");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

function photoFileFilter(req, file, cb) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, or WEBP images are accepted"));
  }
  cb(null, true);
}

export const uploadPhoto = multer({
  storage: photoStorage,
  fileFilter: photoFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Scanned seminar attendance sheets — uploaded by a Unit Leader (or above)
// alongside the per-farmer checklist. Accepts PDF or a photo of the sheet.
export const SHEETS_DIR = path.join(__dirname, "..", "..", "uploads", "sheets");
fs.mkdirSync(SHEETS_DIR, { recursive: true });

const sheetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SHEETS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".pdf";
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

function sheetFileFilter(req, file, cb) {
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    return cb(new Error("Only PDF, JPG, PNG, or WEBP files are accepted"));
  }
  cb(null, true);
}

export const uploadSheet = multer({
  storage: sheetStorage,
  fileFilter: sheetFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Cross-department request attachments — optional, per the requester's
// choice. PDF or common image types, same size cap as other document
// uploads in this app.
export const REQUEST_ATTACHMENTS_DIR = path.join(__dirname, "..", "..", "uploads", "request-attachments");
fs.mkdirSync(REQUEST_ATTACHMENTS_DIR, { recursive: true });

const requestAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REQUEST_ATTACHMENTS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".pdf";
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

function requestAttachmentFileFilter(req, file, cb) {
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
    return cb(new Error("Only PDF, JPG, PNG, or WEBP files are accepted"));
  }
  cb(null, true);
}

export const uploadRequestAttachment = multer({
  storage: requestAttachmentStorage,
  fileFilter: requestAttachmentFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
