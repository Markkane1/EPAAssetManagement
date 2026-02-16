import { Router } from 'express';
import { assignmentController } from '../controllers/assignment.controller';
import { requireAuth } from '../middleware/auth';
import { upload } from '../modules/records/utils/upload';

const router = Router();

router.get('/', requireAuth, assignmentController.list);
router.get('/employee/:employeeId', requireAuth, assignmentController.getByEmployee);
router.get('/asset-item/:assetItemId', requireAuth, assignmentController.getByAssetItem);
router.get('/:id/handover-slip.pdf', requireAuth, assignmentController.handoverSlipPdf);
router.post(
  '/:id/handover-slip/upload-signed',
  requireAuth,
  upload.fields([
    { name: 'signedHandoverFile', maxCount: 1 },
    { name: 'signedFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  assignmentController.uploadSignedHandoverSlip
);
router.post('/:id/request-return', requireAuth, assignmentController.requestReturn);
router.get('/:id/return-slip.pdf', requireAuth, assignmentController.returnSlipPdf);
router.post(
  '/:id/return-slip/upload-signed',
  requireAuth,
  upload.fields([
    { name: 'signedReturnFile', maxCount: 1 },
    { name: 'signedFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  assignmentController.uploadSignedReturnSlip
);
router.get('/:id', requireAuth, assignmentController.getById);
router.post('/', requireAuth, assignmentController.create);
router.put('/:id', requireAuth, assignmentController.update);
router.put('/:id/return', requireAuth, assignmentController.returnAsset);
router.put('/:id/reassign', requireAuth, assignmentController.reassign);
router.delete('/:id', requireAuth, assignmentController.remove);

export default router;
