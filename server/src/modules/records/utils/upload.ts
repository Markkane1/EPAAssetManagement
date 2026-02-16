import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getAllowedUploadMimeTypes,
  isAllowedUploadExtension,
  isAllowedUploadMimeType,
} from '../../../utils/uploadValidation';

const uploadRoot = path.resolve(process.cwd(), 'uploads');
const documentsRoot = path.join(uploadRoot, 'documents');

if (!fs.existsSync(documentsRoot)) {
  fs.mkdirSync(documentsRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, documentsRoot);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${safeName}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!isAllowedUploadMimeType(file.mimetype)) {
    cb(new Error(`Invalid file type. Allowed: ${getAllowedUploadMimeTypes().join(', ')}`));
    return;
  }
  if (!isAllowedUploadExtension(file.originalname, file.mimetype)) {
    cb(new Error('Invalid file extension for MIME type'));
    return;
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function getUploadRoot() {
  return uploadRoot;
}

export function getDocumentsRoot() {
  return documentsRoot;
}
