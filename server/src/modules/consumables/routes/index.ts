import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { validateBody, validateQuery } from '../../../middleware/validate';
import { upload } from '../../records/utils/upload';
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
router.post('/items', requireAuth, requireRoles(['caretaker']), validateBody(consumableItemCreateSchema), consumableItemController.create);
router.put('/items/:id', requireAuth, requireRoles(['caretaker']), validateBody(consumableItemUpdateSchema), consumableItemController.update);
router.delete('/items/:id', requireAuth, requireRoles(['caretaker']), consumableItemController.remove);

router.get('/units', requireAuth, validateQuery(consumableUnitQuerySchema), consumableUnitController.list);
router.get('/units/:id', requireAuth, consumableUnitController.getById);
router.post('/units', requireAuth, requireRoles(['caretaker']), validateBody(consumableUnitCreateSchema), consumableUnitController.create);
router.put('/units/:id', requireAuth, requireRoles(['caretaker']), validateBody(consumableUnitUpdateSchema), consumableUnitController.update);
router.delete('/units/:id', requireAuth, requireRoles(['caretaker']), consumableUnitController.remove);

router.get('/lots', requireAuth, validateQuery(consumableLotQuerySchema), consumableLotController.list);
router.get('/lots/:id', requireAuth, consumableLotController.getById);

router.post('/issues', requireAuth, validateBody(consumableIssueCreateSchema), consumableIssueController.create);
router.post(
  '/consumptions',
  requireAuth,
  validateBody(consumableConsumptionCreateSchema),
  consumableConsumptionController.create
);
router.post('/returns', requireAuth, validateBody(consumableReturnCreateSchema), consumableReturnController.create);

router.get('/containers', requireAuth, consumableContainerController.list);
router.get('/containers/:id', requireAuth, consumableContainerController.getById);
router.post('/containers', requireAuth, requireRoles(['caretaker']), validateBody(consumableContainerCreateSchema), consumableContainerController.create);
router.put('/containers/:id', requireAuth, requireRoles(['office_head', 'caretaker']), validateBody(consumableContainerUpdateSchema), consumableContainerController.update);
router.delete('/containers/:id', requireAuth, requireRoles(['caretaker']), consumableContainerController.remove);

router.get('/reason-codes', requireAuth, validateQuery(reasonCodeQuerySchema), consumableReasonCodeController.list);
router.post('/reason-codes', requireAuth, requireRoles(['caretaker']), validateBody(reasonCodeCreateSchema), consumableReasonCodeController.create);

router.post(
  '/inventory/receive',
  requireAuth,
  upload.single('handoverDocumentation'),
  parseInventoryReceivePayload,
  validateBody(receiveSchema),
  consumableInventoryController.receive
);
router.post('/inventory/transfer', requireAuth, validateBody(transferSchema), consumableInventoryController.transfer);
router.post('/inventory/consume', requireAuth, validateBody(consumeSchema), consumableInventoryController.consume);
router.post('/inventory/adjust', requireAuth, validateBody(adjustSchema), consumableInventoryController.adjust);
router.post('/inventory/dispose', requireAuth, validateBody(disposeSchema), consumableInventoryController.dispose);
router.post('/inventory/return', requireAuth, validateBody(returnSchema), consumableInventoryController.returnToCentral);
router.post('/inventory/opening-balance', requireAuth, validateBody(openingBalanceSchema), consumableInventoryController.openingBalance);

router.get('/inventory/balance', requireAuth, validateQuery(balanceQuerySchema), consumableInventoryController.balance);
router.get('/inventory/balances', requireAuth, validateQuery(balancesQuerySchema), consumableInventoryController.balances);
router.get('/inventory/rollup', requireAuth, validateQuery(rollupQuerySchema), consumableInventoryController.rollup);
router.get('/ledger', requireAuth, validateQuery(ledgerQuerySchema), consumableInventoryController.ledger);
router.get('/expiry', requireAuth, validateQuery(expiryQuerySchema), consumableInventoryController.expiry);

export default router;
