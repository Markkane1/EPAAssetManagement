import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { upload } from '../modules/records/utils/upload';
import { requisitionController } from '../controllers/requisition.controller';

const router = Router();

router.get('/', requireAuth, requisitionController.list);
router.post('/', requireAuth, upload.single('requisitionFile'), requisitionController.create);
router.get('/:id/issuance-report.pdf', requireAuth, requisitionController.issuanceReport);
router.get('/:id', requireAuth, requisitionController.getById);
router.post(
  '/:id/upload-signed-issuance',
  requireAuth,
  upload.fields([
    { name: 'signedIssuanceFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  requisitionController.uploadSignedIssuance
);
router.post('/:id/adjust', requireAuth, requisitionController.adjust);
router.post('/:id/fulfill', requireAuth, requisitionController.fulfill);
router.post('/:id/verify', requireAuth, requisitionController.verify);

export default router;
