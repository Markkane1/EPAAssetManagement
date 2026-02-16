import fs from 'fs/promises';
import path from 'path';
import type { Express } from 'express';
import { createHttpError } from './httpError';

const ALLOWED_UPLOAD_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

const ALLOWED_EXTENSIONS_BY_MIME: Record<AllowedUploadMimeType, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const MAGIC_BYTES_BY_MIME: Record<AllowedUploadMimeType, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
};

const MAGIC_BYTES_READ_LENGTH = 16;

function startsWithSignature(bytes: Buffer, signature: number[]) {
  if (bytes.length < signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}

function normalizeExtension(fileName: string) {
  return path.extname(String(fileName || '')).toLowerCase();
}

export function getAllowedUploadMimeTypes() {
  return [...ALLOWED_UPLOAD_MIME_TYPES];
}

export function isAllowedUploadMimeType(mimeType: string): mimeType is AllowedUploadMimeType {
  return ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType as AllowedUploadMimeType);
}

export function isAllowedUploadExtension(fileName: string, mimeType: string) {
  if (!isAllowedUploadMimeType(mimeType)) return false;
  const extension = normalizeExtension(fileName);
  return ALLOWED_EXTENSIONS_BY_MIME[mimeType].includes(extension);
}

async function readMagicBytes(filePath: string) {
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(MAGIC_BYTES_READ_LENGTH);
    const { bytesRead } = await fileHandle.read(buffer, 0, MAGIC_BYTES_READ_LENGTH, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

export async function assertUploadedFileIntegrity(
  file: Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size' | 'path'>,
  fieldName = 'file'
) {
  if (!isAllowedUploadMimeType(file.mimetype)) {
    throw createHttpError(400, `${fieldName} MIME type is not allowed`);
  }
  if (!isAllowedUploadExtension(file.originalname, file.mimetype)) {
    throw createHttpError(400, `${fieldName} extension does not match MIME type`);
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw createHttpError(400, `${fieldName} is empty`);
  }

  const magicBytes = await readMagicBytes(file.path);
  const signatures = MAGIC_BYTES_BY_MIME[file.mimetype];
  const signatureMatched = signatures.some((signature) => startsWithSignature(magicBytes, signature));
  if (!signatureMatched) {
    throw createHttpError(400, `${fieldName} content does not match declared file type`);
  }
}

