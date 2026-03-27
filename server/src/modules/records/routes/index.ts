import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { createScopedRateLimiter } from '../../../middleware/rateLimitProfiles';
import { validateBody, validateQuery } from '../../../middleware/validate';
import {
  recordCreateSchema,
  recordStatusSchema,
  recordListQuerySchema,
  registerQuerySchema,
  approvalRequestSchema,
  approvalDecisionSchema,
  documentCreateSchema,
  documentListQuerySchema,
  documentLinkSchema,
} from '../validators';
import { recordController } from '../controllers/record.controller';
import { approvalController } from '../controllers/approval.controller';
import { documentController } from '../controllers/document.controller';
import { documentLinkController } from '../controllers/documentLink.controller';
import { upload } from '../utils/upload';

const router = Router();
const registerReadLimiter = createScopedRateLimiter('records-register-read', {
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many register export requests. Please try again shortly.',
});
const recordsWriteLimiter = createScopedRateLimiter('records-write', {
  windowMs: 5 * 60 * 1000,
  max: 80,
  message: 'Too many record changes. Please slow down and try again.',
});
const documentUploadLimiter = createScopedRateLimiter('documents-upload', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many document uploads. Please try again later.',
});

// Register-style endpoints
router.get('/records/register/issue', requireAuth, registerReadLimiter, validateQuery(registerQuerySchema), recordController.issueRegister);
router.get('/records/register/transfer', requireAuth, registerReadLimiter, validateQuery(registerQuerySchema), recordController.transferRegister);
router.get('/records/register/maintenance', requireAuth, registerReadLimiter, validateQuery(registerQuerySchema), recordController.maintenanceRegister);

// Records
router.post('/records', requireAuth, recordsWriteLimiter, validateBody(recordCreateSchema), recordController.create);
router.get('/records', requireAuth, validateQuery(recordListQuerySchema), recordController.list);
router.get('/records/:id/detail', requireAuth, recordController.detail);
router.get('/records/:id', requireAuth, recordController.getById);
router.patch('/records/:id/status', requireAuth, recordsWriteLimiter, validateBody(recordStatusSchema), recordController.updateStatus);

// Approvals
router.post('/records/:id/approval-request', requireAuth, recordsWriteLimiter, validateBody(approvalRequestSchema), approvalController.request);
router.post('/approvals/:id/decide', requireAuth, recordsWriteLimiter, validateBody(approvalDecisionSchema), approvalController.decide);

// Documents
router.post('/documents', requireAuth, recordsWriteLimiter, validateBody(documentCreateSchema), documentController.create);
router.get('/documents', requireAuth, validateQuery(documentListQuerySchema), documentController.list);
router.get('/documents/:id', requireAuth, documentController.getById);
router.post('/documents/:id/upload', requireAuth, documentUploadLimiter, upload.single('file'), documentController.upload);
router.get('/documents/versions/:versionId/download', requireAuth, documentController.downloadVersion);

// Document links
router.post('/document-links', requireAuth, recordsWriteLimiter, validateBody(documentLinkSchema), documentLinkController.create);

export default router;
