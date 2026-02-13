import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { returnRequestController } from '../controllers/returnRequest.controller';
import { upload } from '../modules/records/utils/upload';

const router = Router();

router.post('/', requireAuth, returnRequestController.create);
router.post('/:id/receive', requireAuth, returnRequestController.receive);
router.post(
  '/:id/upload-signed-return',
  requireAuth,
  upload.fields([
    { name: 'signedReturnFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  returnRequestController.uploadSignedReturn
);

export default router;
