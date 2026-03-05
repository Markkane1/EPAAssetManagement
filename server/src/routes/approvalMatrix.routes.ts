import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { idParamSchema } from '../validators/workflowRouteSchemas';
import { approvalMatrixController } from '../controllers/approvalMatrix.controller';

const router = Router();

router.get('/pending', requireAuth, approvalMatrixController.pending);
router.post('/:id/decide', requireAuth, validateParams(idParamSchema), approvalMatrixController.decide);

export default router;
