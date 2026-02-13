import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
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

// Register-style endpoints
router.get('/records/register/issue', requireAuth, validateQuery(registerQuerySchema), recordController.issueRegister);
router.get('/records/register/transfer', requireAuth, validateQuery(registerQuerySchema), recordController.transferRegister);
router.get('/records/register/maintenance', requireAuth, validateQuery(registerQuerySchema), recordController.maintenanceRegister);

// Records
router.post('/records', requireAuth, validateBody(recordCreateSchema), recordController.create);
router.get('/records', requireAuth, validateQuery(recordListQuerySchema), recordController.list);
router.get('/records/:id/detail', requireAuth, recordController.detail);
router.get('/records/:id', requireAuth, recordController.getById);
router.patch('/records/:id/status', requireAuth, validateBody(recordStatusSchema), recordController.updateStatus);

// Approvals
router.post('/records/:id/approval-request', requireAuth, validateBody(approvalRequestSchema), approvalController.request);
router.post('/approvals/:id/decide', requireAuth, validateBody(approvalDecisionSchema), approvalController.decide);

// Documents
router.post('/documents', requireAuth, validateBody(documentCreateSchema), documentController.create);
router.get('/documents', requireAuth, validateQuery(documentListQuerySchema), documentController.list);
router.get('/documents/:id', requireAuth, documentController.getById);
router.post('/documents/:id/upload', requireAuth, upload.single('file'), documentController.upload);
router.get('/documents/versions/:versionId/download', requireAuth, documentController.downloadVersion);

// Document links
router.post('/document-links', requireAuth, validateBody(documentLinkSchema), documentLinkController.create);

export default router;
