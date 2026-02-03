import { Router, Response, NextFunction } from 'express';
import { districtController } from '../controllers/district.controller';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  return next();
};

router.get('/', requireAuth, districtController.list);
router.get('/:id', requireAuth, districtController.getById);
router.post('/', requireAuth, requireSuperAdmin, districtController.create);
router.put('/:id', requireAuth, requireSuperAdmin, districtController.update);
router.delete('/:id', requireAuth, requireSuperAdmin, districtController.remove);

export default router;
