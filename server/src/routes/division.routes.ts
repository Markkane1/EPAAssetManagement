import { Router, Response, NextFunction } from 'express';
import { divisionController } from '../controllers/division.controller';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'org_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  return next();
};

router.get('/', requireAuth, divisionController.list);
router.get('/:id', requireAuth, divisionController.getById);
router.post('/', requireAuth, requireSuperAdmin, divisionController.create);
router.put('/:id', requireAuth, requireSuperAdmin, divisionController.update);
router.delete('/:id', requireAuth, requireSuperAdmin, divisionController.remove);

export default router;
