import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { officeSubLocationController } from '../controllers/officeSubLocation.controller';

const router = Router();

router.get('/', requireAuth, officeSubLocationController.list);
router.post('/', requireAuth, officeSubLocationController.create);
router.put('/:id', requireAuth, officeSubLocationController.update);

export default router;

