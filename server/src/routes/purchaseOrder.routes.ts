import { Router } from 'express';
import { purchaseOrderController } from '../controllers/purchaseOrder.controller';

const router = Router();

router.get('/', purchaseOrderController.list);
router.get('/vendor/:vendorId', purchaseOrderController.getByVendor);
router.get('/project/:projectId', purchaseOrderController.getByProject);
router.get('/pending', purchaseOrderController.getPending);
router.get('/:id', purchaseOrderController.getById);
router.post('/', purchaseOrderController.create);
router.put('/:id', purchaseOrderController.update);
router.delete('/:id', purchaseOrderController.remove);

export default router;
