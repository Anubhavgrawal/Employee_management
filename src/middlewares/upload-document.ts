import multer from "multer";
import path from "node:path";
import { AppError } from "../errors/app-error";
import { errorMessages } from "../constants";

export const allowedDocumentTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedDocumentTypes[extension] || allowedDocumentTypes[extension] !== file.mimetype) return callback(AppError.badRequest(errorMessages.UNSUPPORTED_DOCUMENT_TYPE));
    callback(null, true);
  },
});