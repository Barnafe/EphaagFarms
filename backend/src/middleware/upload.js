import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveFile, deleteFile, publicUrl, CATEGORIES } from "../services/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(__dirname, "..", "..", "uploads");

// Folders that held files before the storage layer existed. Old database rows
// still point at them; new uploads never write here (see services/storage.js).
export const AGREEMENTS_DIR = path.join(UPLOADS, "agreements");
export const PHOTOS_DIR = path.join(UPLOADS, "photos");
export const SHEETS_DIR = path.join(UPLOADS, "sheets");
export const REPORT_PROOFS_DIR = path.join(UPLOADS, "report-proofs");
export const REQUEST_ATTACHMENTS_DIR = path.join(UPLOADS, "request-attachments");
export const MATERIALS_DIR = path.join(UPLOADS, "materials");
export const PRODUCT_IMAGES_DIR = path.join(UPLOADS, "products");

// multer storage engine that hands the bytes to the storage layer (R2 in
// production, local disk in development). After upload:
//   req.file.filename   = the stored file's id (what controllers keep in their column)
//   req.file.stored     = the full stored_files row
//   req.file.publicUrl  = ready-to-use URL for public categories, otherwise null
class StoredFileEngine {
  constructor(category) { this.category = category; }
  _handleFile(req, file, cb) {
    const chunks = [];
    file.stream.on("data", (c) => chunks.push(c));
    file.stream.on("error", cb);
    file.stream.on("end", async () => {
      try {
        const row = await saveFile({
          buffer: Buffer.concat(chunks),
          originalName: file.originalname,
          category: this.category,
          uploadedBy: req.user?.id || null,
          purpose: req.params?.id ? `ref:${req.params.id}` : null,
        });
        cb(null, {
          filename: row.id, stored: row, size: row.size_bytes, mimetype: row.mime_type,
          publicUrl: row.visibility === "public" ? publicUrl(row) : null,
        });
      } catch (err) { cb(err); }
    });
  }
  _removeFile(req, file, cb) {
    deleteFile(file.stored?.id).then(() => cb(null), cb);
  }
}

const uploader = (category) =>
  multer({ storage: new StoredFileEngine(category), limits: { fileSize: CATEGORIES[category].maxBytes, files: 1 } });

export const uploadAgreement = uploader("agreement");
export const uploadPhoto = uploader("profile_photo");
export const uploadMaintenancePhoto = uploader("maintenance_photo");
export const uploadSheet = uploader("attendance_sheet");
export const uploadReportProof = uploader("report_proof");
export const uploadRequestAttachment = uploader("request_attachment");
export const uploadCourseMaterial = uploader("lesson_document");
export const uploadProductImage = uploader("product_image");
// New in this foundation step, used by later phases.
export const uploadPurchasingFile = uploader("purchasing");
export const uploadDeliveryPhoto = uploader("delivery_photo");
export const uploadCertificateAsset = uploader("certificate_asset");
export const uploadIdDocument = uploader("id_document");
