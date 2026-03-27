import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { createScopedRateLimiter } from '../../../middleware/rateLimitProfiles';
import { validateBody, validateQuery } from '../../../middleware/validate';
import { upload, uploadWithLargeFields } from '../../records/utils/upload';
import {
  consumableItemCreateSchema,
  consumableItemUpdateSchema,
  consumableUnitCreateSchema,
  consumableUnitUpdateSchema,
  consumableUnitQuerySchema,
  consumableLotQuerySchema,
  consumableIssueCreateSchema,
  consumableConsumptionCreateSchema,
  consumableReturnCreateSchema,
  consumableContainerCreateSchema,
  consumableContainerUpdateSchema,
  receiveSchema,
  transferSchema,
  consumeSchema,
  adjustSchema,
  disposeSchema,
  returnSchema,
  openingBalanceSchema,
  balanceQuerySchema,
  balancesQuerySchema,
  rollupQuerySchema,
  ledgerQuerySchema,
  expiryQuerySchema,
  reasonCodeQuerySchema,
  reasonCodeCreateSchema,
} from '../validators';
import { consumableItemController } from '../controllers/consumableItem.controller';
import { consumableUnitController } from '../controllers/consumableUnit.controller';
import { consumableLotController } from '../controllers/consumableLot.controller';
import { consumableIssueController } from '../controllers/consumableIssue.controller';
import { consumableConsumptionController } from '../controllers/consumableConsumption.controller';
import { consumableReturnController } from '../controllers/consumableReturn.controller';
import { consumableContainerController } from '../controllers/consumableContainer.controller';
import { consumableReasonCodeController } from '../controllers/consumableReasonCode.controller';
import { consumableInventoryController } from '../controllers/consumableInventory.controller';
import type { AuthRequest } from '../../../middleware/auth';

const router = Router();
const consumableMutationLimiter = createScopedRateLimiter('consumables-mutation', {
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: 'Too many consumable changes. Please try again later.',
});
const consumableUploadLimiter = createScopedRateLimiter('consumables-upload', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many consumable document uploads. Please try again later.',
});

function parseInventoryReceivePayload(req: any, res: any, next: any) {
  try {
    const rawPayload = req.body?.payload;
    if (typeof rawPayload === 'string') {
      req.body = JSON.parse(rawPayload);
    }
    if (typeof req.body?.lot === 'string') {
      req.body.lot = JSON.parse(req.body.lot);
    }
    if (typeof req.body?.containers === 'string') {
      req.body.containers = JSON.parse(req.body.containers);
    }
    next();
  } catch (_error) {
    return res.status(400).json({ message: 'Invalid inventory receive payload' });
  }
}

const requireRoles = (roles: string[]) => (req: AuthRequest, res: any, next: any) => {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ message: 'Unauthorized' });
  if (role === 'org_admin') return next();
  if (roles.includes(role)) return next();
  return res.status(403).json({ message: 'Forbidden' });
};

router.get('/items', requireAuth, consumableItemController.list);
router.get('/items/:id', requireAuth, consumableItemController.getById);
router.post('/items', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), validateBody(consumableItemCreateSchema), consumableItemController.create);
router.put('/items/:id', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), validateBody(consumableItemUpdateSchema), consumableItemController.update);
router.delete('/items/:id', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), consumableItemController.remove);

router.get('/units', requireAuth, validateQuery(consumableUnitQuerySchema), consumableUnitController.list);
router.get('/units/:id', requireAuth, consumableUnitController.getById);
router.post('/units', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), validateBody(consumableUnitCreateSchema), consumableUnitController.create);
router.put('/units/:id', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), validateBody(consumableUnitUpdateSchema), consumableUnitController.update);
router.delete('/units/:id', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), consumableUnitController.remove);

router.get('/lots', requireAuth, validateQuery(consumableLotQuerySchema), consumableLotController.list);
router.get('/lots/:id', requireAuth, consumableLotController.getById);

router.post('/issues', requireAuth, consumableMutationLimiter, validateBody(consumableIssueCreateSchema), consumableIssueController.create);
router.post(
  '/consumptions',
  requireAuth,
  consumableMutationLimiter,
  validateBody(consumableConsumptionCreateSchema),
  consumableConsumptionController.create
);
router.post('/returns', requireAuth, consumableMutationLimiter, validateBody(consumableReturnCreateSchema), consumableReturnController.create);

router.get('/containers', requireAuth, consumableContainerController.list);
router.get('/containers/:id', requireAuth, consumableContainerController.getById);
router.post('/containers', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), validateBody(consumableContainerCreateSchema), consumableContainerController.create);
router.put('/containers/:id', requireAuth, consumableMutationLimiter, requireRoles(['office_head', 'caretaker']), validateBody(consumableContainerUpdateSchema), consumableContainerController.update);
router.delete('/containers/:id', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), consumableContainerController.remove);

router.get('/reason-codes', requireAuth, validateQuery(reasonCodeQuerySchema), consumableReasonCodeController.list);
router.post('/reason-codes', requireAuth, consumableMutationLimiter, requireRoles(['caretaker']), validateBody(reasonCodeCreateSchema), consumableReasonCodeController.create);

router.post(
  '/inventory/receive',
  requireAuth,
  consumableMutationLimiter,
  consumableUploadLimiter,
  uploadWithLargeFields.single('handoverDocumentation'),
  parseInventoryReceivePayload,
  validateBody(receiveSchema),
  consumableInventoryController.receive
);
router.post(
  '/inventory/receive-office',
  requireAuth,
  consumableMutationLimiter,
  consumableUploadLimiter,
  uploadWithLargeFields.single('handoverDocumentation'),
  parseInventoryReceivePayload,
  validateBody(receiveSchema),
  consumableInventoryController.receiveOffice
);
router.post('/inventory/transfer', requireAuth, consumableMutationLimiter, validateBody(transferSchema), consumableInventoryController.transfer);
router.post('/inventory/consume', requireAuth, consumableMutationLimiter, validateBody(consumeSchema), consumableInventoryController.consume);
router.post('/inventory/adjust', requireAuth, consumableMutationLimiter, validateBody(adjustSchema), consumableInventoryController.adjust);
router.post('/inventory/dispose', requireAuth, consumableMutationLimiter, validateBody(disposeSchema), consumableInventoryController.dispose);
router.post('/inventory/return', requireAuth, consumableMutationLimiter, validateBody(returnSchema), consumableInventoryController.returnToCentral);
router.post('/inventory/opening-balance', requireAuth, consumableMutationLimiter, validateBody(openingBalanceSchema), consumableInventoryController.openingBalance);

router.get('/inventory/balance', requireAuth, validateQuery(balanceQuerySchema), consumableInventoryController.balance);
router.get('/inventory/balances', requireAuth, validateQuery(balancesQuerySchema), consumableInventoryController.balances);
router.get('/inventory/rollup', requireAuth, validateQuery(rollupQuerySchema), consumableInventoryController.rollup);
router.get('/ledger', requireAuth, validateQuery(ledgerQuerySchema), consumableInventoryController.ledger);
router.get('/expiry', requireAuth, validateQuery(expiryQuerySchema), consumableInventoryController.expiry);

export default router;
