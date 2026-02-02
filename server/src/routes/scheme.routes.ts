import { Router } from 'express';
import { schemeController } from '../controllers/scheme.controller';

const router = Router();

router.get('/', schemeController.list);
router.get('/project/:projectId', schemeController.getByProject);
router.get('/:id', schemeController.getById);
router.post('/', schemeController.create);
router.put('/:id', schemeController.update);
router.delete('/:id', schemeController.remove);

export default router;
