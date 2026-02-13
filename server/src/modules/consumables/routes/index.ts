import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth';
import { validateBody, validateQuery } from '../../../middleware/validate';
import {
  consumableItemCreateSchema,
  consumableItemUpdateSchema,
  consumableUnitCreateSchema,
  consumableUnitUpdateSchema,
  consumableUnitQuerySchema,
  consumableSupplierCreateSchema,
  consumableSupplierUpdateSchema,
  consumableLotCreateSchema,
  consumableLotUpdateSchema,
  consumableContainerCreateSchema,
  consumableContainerUpdateSchema,
  consumableLocationCreateSchema,
  consumableLocationUpdateSchema,
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
import { consumableSupplierController } from '../controllers/consumableSupplier.controller';
import { consumableLotController } from '../controllers/consumableLot.controller';
import { consumableContainerController } from '../controllers/consumableContainer.controller';
import { consumableLocationController } from '../controllers/consumableLocation.controller';
import { consumableReasonCodeController } from '../controllers/consumableReasonCode.controller';
import { consumableInventoryController } from '../controllers/consumableInventory.controller';
import type { AuthRequest } from '../../../middleware/auth';

const router = Router();

const requireRoles = (roles: string[]) => (req: AuthRequest, res: any, next: any) => {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ message: 'Unauthorized' });
  if (role === 'super_admin' || role === 'admin') return next();
  if (roles.includes(role)) return next();
  return res.status(403).json({ message: 'Forbidden' });
};

router.get('/items', requireAuth, consumableItemController.list);
router.get('/items/:id', requireAuth, consumableItemController.getById);
router.post('/items', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableItemCreateSchema), consumableItemController.create);
router.put('/items/:id', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableItemUpdateSchema), consumableItemController.update);
router.delete('/items/:id', requireAuth, requireRoles(['central_store_admin']), consumableItemController.remove);

router.get('/units', requireAuth, validateQuery(consumableUnitQuerySchema), consumableUnitController.list);
router.get('/units/:id', requireAuth, consumableUnitController.getById);
router.post('/units', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableUnitCreateSchema), consumableUnitController.create);
router.put('/units/:id', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableUnitUpdateSchema), consumableUnitController.update);
router.delete('/units/:id', requireAuth, requireRoles(['central_store_admin']), consumableUnitController.remove);

router.get('/suppliers', requireAuth, consumableSupplierController.list);
router.get('/suppliers/:id', requireAuth, consumableSupplierController.getById);
router.post('/suppliers', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableSupplierCreateSchema), consumableSupplierController.create);
router.put('/suppliers/:id', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableSupplierUpdateSchema), consumableSupplierController.update);
router.delete('/suppliers/:id', requireAuth, requireRoles(['central_store_admin']), consumableSupplierController.remove);

router.get('/lots', requireAuth, consumableLotController.list);
router.get('/lots/:id', requireAuth, consumableLotController.getById);
router.post('/lots', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableLotCreateSchema), consumableLotController.create);
router.put('/lots/:id', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableLotUpdateSchema), consumableLotController.update);
router.delete('/lots/:id', requireAuth, requireRoles(['central_store_admin']), consumableLotController.remove);

router.get('/containers', requireAuth, consumableContainerController.list);
router.get('/containers/:id', requireAuth, consumableContainerController.getById);
router.post('/containers', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableContainerCreateSchema), consumableContainerController.create);
router.put('/containers/:id', requireAuth, requireRoles(['central_store_admin', 'lab_manager', 'location_admin']), validateBody(consumableContainerUpdateSchema), consumableContainerController.update);
router.delete('/containers/:id', requireAuth, requireRoles(['central_store_admin']), consumableContainerController.remove);

router.get('/locations', requireAuth, consumableLocationController.list);
router.get('/locations/:id', requireAuth, consumableLocationController.getById);
router.post('/locations', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableLocationCreateSchema), consumableLocationController.create);
router.put('/locations/:id', requireAuth, requireRoles(['central_store_admin']), validateBody(consumableLocationUpdateSchema), consumableLocationController.update);
router.delete('/locations/:id', requireAuth, requireRoles(['central_store_admin']), consumableLocationController.remove);

router.get('/reason-codes', requireAuth, validateQuery(reasonCodeQuerySchema), consumableReasonCodeController.list);
router.post('/reason-codes', requireAuth, requireRoles(['central_store_admin']), validateBody(reasonCodeCreateSchema), consumableReasonCodeController.create);

router.post('/inventory/receive', requireAuth, validateBody(receiveSchema), consumableInventoryController.receive);
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
