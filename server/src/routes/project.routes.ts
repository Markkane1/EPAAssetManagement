import { Router } from 'express';
import { projectController } from '../controllers/project.controller';

const router = Router();

router.get('/', projectController.list);
router.get('/active', projectController.getActive);
router.get('/:id', projectController.getById);
router.post('/', projectController.create);
router.put('/:id', projectController.update);
router.delete('/:id', projectController.remove);

export default router;
