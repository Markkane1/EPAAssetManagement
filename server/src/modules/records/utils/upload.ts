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
const MAX_ORIGINAL_NAME_LENGTH = 180;
const MAX_SAFE_BASENAME_LENGTH = 64;
type UploadLimits = NonNullable<multer.Options['limits']>;

const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  fileSize: 10 * 1024 * 1024,
  files: 2,
  fields: 50,
  parts: 60,
  fieldNameSize: 100,
  fieldSize: 256 * 1024,
  headerPairs: 2000,
};

if (!fs.existsSync(documentsRoot)) {
  fs.mkdirSync(documentsRoot, { recursive: true });
}

function hasUnsafeOriginalName(value: string) {
  return !value || value.length > MAX_ORIGINAL_NAME_LENGTH || /[\\/]/.test(value) || value.includes('\0');
}

function sanitizeStoredBaseName(originalName: string) {
  const parsed = path.parse(path.basename(String(originalName || '')));
  const safeBase = parsed.name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, MAX_SAFE_BASENAME_LENGTH);
  return safeBase || 'file';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, documentsRoot);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(path.basename(file.originalname)).toLowerCase();
    const safeBaseName = sanitizeStoredBaseName(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${safeBaseName}${extension}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (hasUnsafeOriginalName(String(file.originalname || ''))) {
    cb(new Error('Invalid file name'));
    return;
  }
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

type UploadLimitOverrides = Partial<UploadLimits>;

export function createUpload(limitOverrides: UploadLimitOverrides = {}) {
  return multer({
    preservePath: false,
    storage,
    fileFilter,
    limits: {
      ...DEFAULT_UPLOAD_LIMITS,
      ...limitOverrides,
    },
  });
}

export const upload = createUpload();
export const uploadWithLargeFields = createUpload({
  fieldSize: 2 * 1024 * 1024,
  fields: 100,
  parts: 120,
});

export function getUploadRoot() {
  return uploadRoot;
}

export function getDocumentsRoot() {
  return documentsRoot;
}
