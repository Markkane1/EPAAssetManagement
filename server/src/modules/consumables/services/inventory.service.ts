import mongoose, { ClientSession } from 'mongoose';
import { ActivityLogModel } from '../../../models/activityLog.model';
import { OfficeModel } from '../../../models/office.model';
import { UserModel } from '../../../models/user.model';
import { ConsumableItemModel } from '../models/consumableItem.model';
import { ConsumableLotModel } from '../models/consumableLot.model';
import { ConsumableContainerModel } from '../models/consumableContainer.model';
import { ConsumableInventoryBalanceModel } from '../models/consumableInventoryBalance.model';
import { ConsumableInventoryTransactionModel } from '../models/consumableInventoryTransaction.model';
import { ConsumableReasonCodeModel } from '../models/consumableReasonCode.model';
import { createHttpError } from '../utils/httpError';
import { convertToBaseQty, formatUom } from '../utils/unitConversion';
import { resolveConsumablePermissions } from '../utils/permissions';

const CENTRAL_TYPE = 'CENTRAL';

type AuthUser = {
  userId: string;
  role: string;
  email: string;
};

type AuditMeta = Record<string, unknown> | undefined;

type BalanceKey = {
  locationId: string;
  itemId: string;
  lotId?: string | null;
};

const nowIso = () => new Date().toISOString();

function ensureAllowed(condition: boolean, message: string) {
  if (!condition) throw createHttpError(403, message);
}

async function getUserContext(userId: string, session?: ClientSession) {
  const user = await UserModel.findById(userId).session(session || null);
  if (!user) throw createHttpError(401, 'Unauthorized');
  return user;
}

async function getLocation(locationId: string, session?: ClientSession) {
  const location = await OfficeModel.findById(locationId).session(session || null);
  if (!location) throw createHttpError(404, 'Location not found');
  return location;
}

async function getItem(itemId: string, session?: ClientSession) {
  const item = await ConsumableItemModel.findById(itemId).session(session || null);
  if (!item) throw createHttpError(404, 'Consumable item not found');
  return item;
}

async function getLot(lotId: string, session?: ClientSession) {
  const lot = await ConsumableLotModel.findById(lotId).session(session || null);
  if (!lot) throw createHttpError(404, 'Lot not found');
  return lot;
}

async function getContainer(containerId: string, session?: ClientSession) {
  const container = await ConsumableContainerModel.findById(containerId).session(session || null);
  if (!container) throw createHttpError(404, 'Container not found');
  return container;
}

async function createAuditLog(
  userId: string,
  activityType: string,
  description: string,
  metadata?: AuditMeta,
  session?: ClientSession
) {
  await ActivityLogModel.create(
    [
      {
        user_id: userId,
        activity_type: activityType,
        description,
        metadata: metadata || {},
      },
    ],
    { session }
  );
}

async function getBalance({ locationId, itemId, lotId }: BalanceKey, session: ClientSession) {
  return ConsumableInventoryBalanceModel.findOne({
    location_id: locationId,
    consumable_item_id: itemId,
    lot_id: lotId ?? null,
  }).session(session);
}

async function updateBalance(
  key: BalanceKey,
  delta: number,
  allowNegative: boolean,
  session: ClientSession
) {
  const balance = await getBalance(key, session);
  const current = balance?.qty_on_hand_base || 0;
  const next = current + delta;
  if (next < 0 && !allowNegative) {
    throw createHttpError(400, 'Insufficient stock for requested operation');
  }
  if (!balance) {
    const created = await ConsumableInventoryBalanceModel.create(
      [
        {
          location_id: key.locationId,
          consumable_item_id: key.itemId,
          lot_id: key.lotId ?? null,
          qty_on_hand_base: next,
          qty_reserved_base: 0,
        },
      ],
      { session }
    );
    return created[0];
  }
  balance.qty_on_hand_base = next;
  await balance.save({ session });
  return balance;
}

async function verifyReasonCode(reasonCodeId: string, category: 'ADJUST' | 'DISPOSE', session: ClientSession) {
  const reason = await ConsumableReasonCodeModel.findById(reasonCodeId).session(session);
  if (!reason) throw createHttpError(404, 'Reason code not found');
  if (reason.category !== category) {
    throw createHttpError(400, `Reason code category must be ${category}`);
  }
  return reason;
}

function requiresContainer(item: { requires_container_tracking?: boolean; is_controlled?: boolean }) {
  return Boolean(item.requires_container_tracking || item.is_controlled);
}

function normalizeAllowNegative(allowNegative: boolean | undefined, overrideNote?: string) {
  if (!allowNegative) return false;
  if (!overrideNote || overrideNote.trim().length === 0) {
    throw createHttpError(400, 'Override note is required when allowing negative stock');
  }
  return true;
}

function buildMetadata(payload: any, allowNegative: boolean) {
  const metadata = { ...(payload.metadata || {}) };
  if (allowNegative && payload.overrideNote) {
    metadata.overrideNote = payload.overrideNote;
  }
  return metadata;
}

async function resolveAccessibleLocationId(userId: string, role: string, session?: ClientSession) {
  if (role === 'super_admin' || role === 'admin' || role === 'auditor' || role === 'viewer') return null;
  const user = await getUserContext(userId, session);
  return user.location_id?.toString() || null;
}

async function pickLotsByFefo(
  locationId: string,
  itemId: string,
  qtyBase: number,
  session: ClientSession
) {
  const balances = await ConsumableInventoryBalanceModel.find({
    location_id: locationId,
    consumable_item_id: itemId,
    qty_on_hand_base: { $gt: 0 },
  }).session(session);

  if (balances.length === 0) {
    throw createHttpError(400, 'Insufficient stock for requested operation');
  }

  const lotIds = balances
    .map((balance) => balance.lot_id?.toString())
    .filter((id): id is string => Boolean(id));

  const lots = await ConsumableLotModel.find({ _id: { $in: lotIds } }).session(session);
  const lotMap = new Map(lots.map((lot) => [lot.id.toString(), lot]));

  const sorted = balances.sort((a, b) => {
    const aLot = a.lot_id ? lotMap.get(a.lot_id.toString()) : null;
    const bLot = b.lot_id ? lotMap.get(b.lot_id.toString()) : null;
    const aExpiry = aLot?.expiry_date ? new Date(aLot.expiry_date).getTime() : Number.POSITIVE_INFINITY;
    const bExpiry = bLot?.expiry_date ? new Date(bLot.expiry_date).getTime() : Number.POSITIVE_INFINITY;
    return aExpiry - bExpiry;
  });

  const allocations: Array<{ lotId: string; qtyBase: number }> = [];
  let remaining = qtyBase;

  for (const balance of sorted) {
    if (remaining <= 0) break;
    if (!balance.lot_id) continue;
    const available = balance.qty_on_hand_base || 0;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    allocations.push({ lotId: balance.lot_id.toString(), qtyBase: take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw createHttpError(400, 'Insufficient stock for requested operation');
  }

  return allocations;
}

async function ensureLotMatchesItem(lotId: string, itemId: string, session: ClientSession) {
  const lot = await getLot(lotId, session);
  if (lot.consumable_item_id.toString() !== itemId) {
    throw createHttpError(400, 'Lot does not belong to consumable item');
  }
  return lot;
}

async function ensureContainerMatchesItem(containerId: string, itemId: string, session: ClientSession) {
  const container = await getContainer(containerId, session);
  const lot = await getLot(container.lot_id.toString(), session);
  if (lot.consumable_item_id.toString() !== itemId) {
    throw createHttpError(400, 'Container does not belong to consumable item');
  }
  return container;
}

async function ensureLocationAccess(user: AuthUser, locationId: string, session: ClientSession) {
  const role = user.role;
  if (role === 'super_admin' || role === 'admin' || role === 'auditor' || role === 'viewer') return;
  const userContext = await getUserContext(user.userId, session);
  if (!userContext.location_id) {
    throw createHttpError(403, 'User is not assigned to a location');
  }
  if (userContext.location_id.toString() !== locationId) {
    throw createHttpError(403, 'User does not have access to this location');
  }
}

async function getCentralStoreLocation(session: ClientSession) {
  const central = await OfficeModel.findOne({ type: CENTRAL_TYPE }).session(session);
  if (!central) throw createHttpError(400, 'Central Store location is not configured');
  return central;
}

export const inventoryService = {
  async receive(user: AuthUser, payload: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canReceiveCentral, 'Not permitted to receive into Central Store');

        const item = await getItem(payload.itemId, session);
        const location = await getLocation(payload.locationId, session);
        if (location.type !== CENTRAL_TYPE) {
          throw createHttpError(400, 'Receipts must be into Central Store');
        }

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

        let lotId: string | null = payload.lotId || null;
        if (lotId) {
          await ensureLotMatchesItem(lotId, item.id, session);
        } else if (item.requires_lot_tracking !== false) {
          if (!payload.lot) throw createHttpError(400, 'Lot details are required for this item');
          const newLot = await ConsumableLotModel.create(
            [
              {
                consumable_item_id: item.id,
                supplier_id: payload.lot.supplierId || null,
                lot_number: payload.lot.lotNumber,
                received_date: payload.lot.receivedDate,
                expiry_date: payload.lot.expiryDate || null,
                docs: {
                  sds_url: payload.lot.docs?.sdsUrl || null,
                  coa_url: payload.lot.docs?.coaUrl || null,
                  invoice_url: payload.lot.docs?.invoiceUrl || null,
                },
              },
            ],
            { session }
          );
          lotId = newLot[0].id.toString();
        }

        const tx = await ConsumableInventoryTransactionModel.create(
          [
            {
              tx_type: 'RECEIPT',
              tx_time: nowIso(),
              created_by: user.userId,
              from_location_id: null,
              to_location_id: location.id,
              consumable_item_id: item.id,
              lot_id: lotId,
              container_id: null,
              qty_base: qtyBase,
              entered_qty: payload.qty,
              entered_uom: formatUom(payload.uom),
              reason_code_id: null,
              reference: payload.reference || null,
              notes: payload.notes || null,
              metadata: buildMetadata(payload, false),
            },
          ],
          { session }
        );

        await updateBalance(
          {
            locationId: location.id,
            itemId: item.id,
            lotId,
          },
          qtyBase,
          true,
          session
        );

        if (Array.isArray(payload.containers) && payload.containers.length > 0) {
          const sumContainers = payload.containers.reduce((total: number, container: any) => {
            return total + convertToBaseQty(container.initialQty, payload.uom, item.base_uom);
          }, 0);
          const diff = Math.abs(sumContainers - qtyBase);
          if (diff > 0.0001) {
            throw createHttpError(400, 'Container quantities must sum to total received quantity');
          }
          await ConsumableContainerModel.insertMany(
            payload.containers.map((container: any) => ({
              lot_id: lotId,
              container_code: container.containerCode,
              initial_qty_base: convertToBaseQty(container.initialQty, payload.uom, item.base_uom),
              current_qty_base: convertToBaseQty(container.initialQty, payload.uom, item.base_uom),
              current_location_id: location.id,
              status: 'IN_STOCK',
              opened_date: container.openedDate || null,
            })),
            { session }
          );
        }

        await createAuditLog(
          user.userId,
          'consumables.receive',
          `Received ${payload.qty} ${payload.uom} of ${item.name} into ${location.name}`,
          { itemId: item.id, locationId: location.id, lotId, qtyBase },
          session
        );

        result = tx[0];
      });
    } finally {
      session.endSession();
    }
    return result;
  },

  async transfer(user: AuthUser, payload: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);

        const item = await getItem(payload.itemId, session);
        const fromLocation = await getLocation(payload.fromLocationId, session);
        const toLocation = await getLocation(payload.toLocationId, session);

        if (fromLocation.type === CENTRAL_TYPE) {
          ensureAllowed(permissions.canTransferCentral, 'Not permitted to transfer from Central Store');
        } else {
          ensureAllowed(permissions.canTransferLab, 'Not permitted to transfer between labs');
          await ensureLocationAccess(user, fromLocation.id, session);
        }

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

        const allowNegative = normalizeAllowNegative(payload.allowNegative, payload.overrideNote);
        if (allowNegative && !permissions.canOverrideNegative) {
          throw createHttpError(403, 'Not permitted to override negative stock');
        }

        const needsContainer = requiresContainer(item);
        if (needsContainer && !payload.containerId) {
          throw createHttpError(400, 'Container is required for this item');
        }

        if (payload.containerId) {
          const container = await ensureContainerMatchesItem(payload.containerId, item.id, session);
          if (container.current_location_id.toString() !== fromLocation.id) {
            throw createHttpError(400, 'Container is not at the source location');
          }
          const containerQty = container.current_qty_base || 0;
          if (Math.abs(containerQty - qtyBase) > 0.0001) {
            throw createHttpError(400, 'Container transfers must move the full container quantity');
          }

          await updateBalance(
            { locationId: fromLocation.id, itemId: item.id, lotId: container.lot_id.toString() },
            -containerQty,
            allowNegative,
            session
          );
          await updateBalance(
            { locationId: toLocation.id, itemId: item.id, lotId: container.lot_id.toString() },
            containerQty,
            true,
            session
          );

          container.current_location_id = toLocation.id;
          await container.save({ session });

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'TRANSFER',
                tx_time: nowIso(),
                created_by: user.userId,
                from_location_id: fromLocation.id,
                to_location_id: toLocation.id,
                consumable_item_id: item.id,
                lot_id: container.lot_id,
                container_id: container.id,
                qty_base: containerQty,
                entered_qty: payload.qty,
                entered_uom: formatUom(payload.uom),
                reason_code_id: null,
                reference: payload.reference || null,
                notes: payload.notes || null,
                metadata: buildMetadata(payload, allowNegative),
              },
            ],
            { session }
          );

          await createAuditLog(
            user.userId,
            'consumables.transfer',
            `Transferred ${payload.qty} ${payload.uom} of ${item.name} from ${fromLocation.name} to ${toLocation.name}`,
            { itemId: item.id, fromLocationId: fromLocation.id, toLocationId: toLocation.id, lotId: container.lot_id },
            session
          );

          result = tx[0];
          return;
        }

        let allocations: Array<{ lotId: string | null; qtyBase: number }> = [];
        if (item.requires_lot_tracking === false) {
          allocations = [{ lotId: null, qtyBase }];
        } else if (payload.lotId) {
          await ensureLotMatchesItem(payload.lotId, item.id, session);
          allocations = [{ lotId: payload.lotId, qtyBase }];
        } else {
          const picks = await pickLotsByFefo(fromLocation.id, item.id, qtyBase, session);
          allocations = picks.map((pick) => ({ lotId: pick.lotId, qtyBase: pick.qtyBase }));
        }

        const transactions: any[] = [];
        for (const allocation of allocations) {
          await updateBalance(
            { locationId: fromLocation.id, itemId: item.id, lotId: allocation.lotId },
            -allocation.qtyBase,
            allowNegative,
            session
          );
          await updateBalance(
            { locationId: toLocation.id, itemId: item.id, lotId: allocation.lotId },
            allocation.qtyBase,
            true,
            session
          );

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'TRANSFER',
                tx_time: nowIso(),
                created_by: user.userId,
                from_location_id: fromLocation.id,
                to_location_id: toLocation.id,
                consumable_item_id: item.id,
                lot_id: allocation.lotId,
                container_id: null,
                qty_base: allocation.qtyBase,
                entered_qty: allocation.qtyBase,
                entered_uom: item.base_uom,
                reason_code_id: null,
                reference: payload.reference || null,
                notes: payload.notes || null,
                metadata: buildMetadata(payload, allowNegative),
              },
            ],
            { session }
          );
          transactions.push(tx[0]);
        }

        await createAuditLog(
          user.userId,
          'consumables.transfer',
          `Transferred ${payload.qty} ${payload.uom} of ${item.name} from ${fromLocation.name} to ${toLocation.name}`,
          { itemId: item.id, fromLocationId: fromLocation.id, toLocationId: toLocation.id },
          session
        );

        result = transactions;
      });
    } finally {
      session.endSession();
    }
    return result;
  },
  async consume(user: AuthUser, payload: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canConsume, 'Not permitted to consume consumables');

        const item = await getItem(payload.itemId, session);
        const location = await getLocation(payload.locationId, session);
        await ensureLocationAccess(user, location.id, session);

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

        const allowNegative = normalizeAllowNegative(payload.allowNegative, payload.overrideNote);
        if (allowNegative && !permissions.canOverrideNegative) {
          throw createHttpError(403, 'Not permitted to override negative stock');
        }

        const needsContainer = requiresContainer(item);
        if (needsContainer && !payload.containerId) {
          throw createHttpError(400, 'Container is required for this item');
        }

        if (payload.containerId) {
          const container = await ensureContainerMatchesItem(payload.containerId, item.id, session);
          if (container.current_location_id.toString() !== location.id) {
            throw createHttpError(400, 'Container is not at the selected location');
          }
          if (container.current_qty_base < qtyBase && !allowNegative) {
            throw createHttpError(400, 'Insufficient quantity in container');
          }
          container.current_qty_base = container.current_qty_base - qtyBase;
          if (container.current_qty_base <= 0) {
            container.current_qty_base = 0;
            container.status = 'EMPTY';
          }
          if (!container.opened_date) {
            container.opened_date = nowIso();
          }
          await container.save({ session });

          await updateBalance(
            { locationId: location.id, itemId: item.id, lotId: container.lot_id.toString() },
            -qtyBase,
            allowNegative,
            session
          );

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'CONSUME',
                tx_time: nowIso(),
                created_by: user.userId,
                from_location_id: location.id,
                to_location_id: null,
                consumable_item_id: item.id,
                lot_id: container.lot_id,
                container_id: container.id,
                qty_base: qtyBase,
                entered_qty: payload.qty,
                entered_uom: formatUom(payload.uom),
                reason_code_id: null,
                reference: payload.reference || null,
                notes: payload.notes || null,
                metadata: buildMetadata(payload, allowNegative),
              },
            ],
            { session }
          );

          await createAuditLog(
            user.userId,
            'consumables.consume',
            `Consumed ${payload.qty} ${payload.uom} of ${item.name} at ${location.name}`,
            { itemId: item.id, locationId: location.id, lotId: container.lot_id },
            session
          );

          result = tx[0];
          return;
        }

        let allocations: Array<{ lotId: string | null; qtyBase: number }> = [];
        if (item.requires_lot_tracking === false) {
          allocations = [{ lotId: null, qtyBase }];
        } else if (payload.lotId) {
          await ensureLotMatchesItem(payload.lotId, item.id, session);
          allocations = [{ lotId: payload.lotId, qtyBase }];
        } else {
          const picks = await pickLotsByFefo(location.id, item.id, qtyBase, session);
          allocations = picks.map((pick) => ({ lotId: pick.lotId, qtyBase: pick.qtyBase }));
        }

        const transactions: any[] = [];
        for (const allocation of allocations) {
          await updateBalance(
            { locationId: location.id, itemId: item.id, lotId: allocation.lotId },
            -allocation.qtyBase,
            allowNegative,
            session
          );
          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'CONSUME',
                tx_time: nowIso(),
                created_by: user.userId,
                from_location_id: location.id,
                to_location_id: null,
                consumable_item_id: item.id,
                lot_id: allocation.lotId,
                container_id: null,
                qty_base: allocation.qtyBase,
                entered_qty: allocation.qtyBase,
                entered_uom: item.base_uom,
                reason_code_id: null,
                reference: payload.reference || null,
                notes: payload.notes || null,
                metadata: buildMetadata(payload, allowNegative),
              },
            ],
            { session }
          );
          transactions.push(tx[0]);
        }

        await createAuditLog(
          user.userId,
          'consumables.consume',
          `Consumed ${payload.qty} ${payload.uom} of ${item.name} at ${location.name}`,
          { itemId: item.id, locationId: location.id },
          session
        );

        result = transactions;
      });
    } finally {
      session.endSession();
    }
    return result;
  },

  async adjust(user: AuthUser, payload: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canAdjust, 'Not permitted to adjust inventory');

        const item = await getItem(payload.itemId, session);
        const location = await getLocation(payload.locationId, session);
        await ensureLocationAccess(user, location.id, session);

        await verifyReasonCode(payload.reasonCodeId, 'ADJUST', session);

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');
        const direction = payload.direction === 'DECREASE' ? -1 : 1;

        const allowNegative = normalizeAllowNegative(payload.allowNegative, payload.overrideNote);
        if (allowNegative && !permissions.canOverrideNegative) {
          throw createHttpError(403, 'Not permitted to override negative stock');
        }

        const needsContainer = requiresContainer(item);
        if (needsContainer && !payload.containerId) {
          throw createHttpError(400, 'Container is required for this item');
        }

        let lotId: string | null = payload.lotId || null;
        if (payload.containerId) {
          const container = await ensureContainerMatchesItem(payload.containerId, item.id, session);
          if (container.current_location_id.toString() !== location.id) {
            throw createHttpError(400, 'Container is not at the selected location');
          }
          lotId = container.lot_id.toString();
          container.current_qty_base = container.current_qty_base + direction * qtyBase;
          if (container.current_qty_base <= 0) {
            container.current_qty_base = 0;
            container.status = 'EMPTY';
          }
          await container.save({ session });
        } else if (item.requires_lot_tracking !== false) {
          if (!lotId) throw createHttpError(400, 'Lot is required for this item');
          await ensureLotMatchesItem(lotId, item.id, session);
        }

        await updateBalance(
          { locationId: location.id, itemId: item.id, lotId },
          direction * qtyBase,
          allowNegative,
          session
        );

        const tx = await ConsumableInventoryTransactionModel.create(
          [
            {
              tx_type: 'ADJUST',
              tx_time: nowIso(),
              created_by: user.userId,
              from_location_id: direction < 0 ? location.id : null,
              to_location_id: direction > 0 ? location.id : null,
              consumable_item_id: item.id,
              lot_id: lotId,
              container_id: payload.containerId || null,
              qty_base: qtyBase,
              entered_qty: payload.qty,
              entered_uom: formatUom(payload.uom),
              reason_code_id: payload.reasonCodeId,
              reference: payload.reference || null,
              notes: payload.notes || null,
              metadata: buildMetadata(payload, allowNegative),
            },
          ],
          { session }
        );

        await createAuditLog(
          user.userId,
          'consumables.adjust',
          `Adjusted ${payload.qty} ${payload.uom} of ${item.name} at ${location.name}`,
          { itemId: item.id, locationId: location.id, lotId, direction },
          session
        );

        result = tx[0];
      });
    } finally {
      session.endSession();
    }
    return result;
  },
  async dispose(user: AuthUser, payload: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canDispose, 'Not permitted to dispose inventory');

        const item = await getItem(payload.itemId, session);
        const location = await getLocation(payload.locationId, session);
        await ensureLocationAccess(user, location.id, session);

        await verifyReasonCode(payload.reasonCodeId, 'DISPOSE', session);

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

        const allowNegative = normalizeAllowNegative(payload.allowNegative, payload.overrideNote);
        if (allowNegative && !permissions.canOverrideNegative) {
          throw createHttpError(403, 'Not permitted to override negative stock');
        }

        const needsContainer = requiresContainer(item);
        if (needsContainer && !payload.containerId) {
          throw createHttpError(400, 'Container is required for this item');
        }

        let lotId: string | null = payload.lotId || null;
        if (payload.containerId) {
          const container = await ensureContainerMatchesItem(payload.containerId, item.id, session);
          if (container.current_location_id.toString() !== location.id) {
            throw createHttpError(400, 'Container is not at the selected location');
          }
          lotId = container.lot_id.toString();
          if (container.current_qty_base < qtyBase && !allowNegative) {
            throw createHttpError(400, 'Insufficient quantity in container');
          }
          container.current_qty_base = container.current_qty_base - qtyBase;
          if (container.current_qty_base <= 0) {
            container.current_qty_base = 0;
            container.status = 'DISPOSED';
          }
          await container.save({ session });
        } else if (item.requires_lot_tracking !== false) {
          if (!lotId) throw createHttpError(400, 'Lot is required for this item');
          await ensureLotMatchesItem(lotId, item.id, session);
        } else if (!lotId) {
          lotId = null;
        }

        await updateBalance(
          { locationId: location.id, itemId: item.id, lotId },
          -qtyBase,
          allowNegative,
          session
        );

        const tx = await ConsumableInventoryTransactionModel.create(
          [
            {
              tx_type: 'DISPOSE',
              tx_time: nowIso(),
              created_by: user.userId,
              from_location_id: location.id,
              to_location_id: null,
              consumable_item_id: item.id,
              lot_id: lotId,
              container_id: payload.containerId || null,
              qty_base: qtyBase,
              entered_qty: payload.qty,
              entered_uom: formatUom(payload.uom),
              reason_code_id: payload.reasonCodeId,
              reference: payload.reference || null,
              notes: payload.notes || null,
              metadata: buildMetadata(payload, allowNegative),
            },
          ],
          { session }
        );

        await createAuditLog(
          user.userId,
          'consumables.dispose',
          `Disposed ${payload.qty} ${payload.uom} of ${item.name} at ${location.name}`,
          { itemId: item.id, locationId: location.id, lotId },
          session
        );

        result = tx[0];
      });
    } finally {
      session.endSession();
    }
    return result;
  },

  async returnToCentral(user: AuthUser, payload: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canReturn, 'Not permitted to return inventory');

        const item = await getItem(payload.itemId, session);
        const fromLocation = await getLocation(payload.fromLocationId, session);
        await ensureLocationAccess(user, fromLocation.id, session);

        const toLocation = payload.toLocationId
          ? await getLocation(payload.toLocationId, session)
          : await getCentralStoreLocation(session);

        if (toLocation.type !== CENTRAL_TYPE) {
          throw createHttpError(400, 'Returns must be sent to Central Store');
        }

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

        const allowNegative = normalizeAllowNegative(payload.allowNegative, payload.overrideNote);
        if (allowNegative && !permissions.canOverrideNegative) {
          throw createHttpError(403, 'Not permitted to override negative stock');
        }

        const needsContainer = requiresContainer(item);
        if (needsContainer && !payload.containerId) {
          throw createHttpError(400, 'Container is required for this item');
        }

        if (payload.containerId) {
          const container = await ensureContainerMatchesItem(payload.containerId, item.id, session);
          if (container.current_location_id.toString() !== fromLocation.id) {
            throw createHttpError(400, 'Container is not at the source location');
          }
          const containerQty = container.current_qty_base || 0;
          if (Math.abs(containerQty - qtyBase) > 0.0001) {
            throw createHttpError(400, 'Container returns must move the full container quantity');
          }

          await updateBalance(
            { locationId: fromLocation.id, itemId: item.id, lotId: container.lot_id.toString() },
            -containerQty,
            allowNegative,
            session
          );
          await updateBalance(
            { locationId: toLocation.id, itemId: item.id, lotId: container.lot_id.toString() },
            containerQty,
            true,
            session
          );

          container.current_location_id = toLocation.id;
          await container.save({ session });

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'RETURN',
                tx_time: nowIso(),
                created_by: user.userId,
                from_location_id: fromLocation.id,
                to_location_id: toLocation.id,
                consumable_item_id: item.id,
                lot_id: container.lot_id,
                container_id: container.id,
                qty_base: containerQty,
                entered_qty: payload.qty,
                entered_uom: formatUom(payload.uom),
                reason_code_id: null,
                reference: payload.reference || null,
                notes: payload.notes || null,
                metadata: buildMetadata(payload, allowNegative),
              },
            ],
            { session }
          );

          await createAuditLog(
            user.userId,
            'consumables.return',
            `Returned ${payload.qty} ${payload.uom} of ${item.name} to ${toLocation.name}`,
            { itemId: item.id, fromLocationId: fromLocation.id, toLocationId: toLocation.id },
            session
          );

          result = tx[0];
          return;
        }

        let allocations: Array<{ lotId: string | null; qtyBase: number }> = [];
        if (item.requires_lot_tracking === false) {
          allocations = [{ lotId: null, qtyBase }];
        } else if (payload.lotId) {
          await ensureLotMatchesItem(payload.lotId, item.id, session);
          allocations = [{ lotId: payload.lotId, qtyBase }];
        } else {
          const picks = await pickLotsByFefo(fromLocation.id, item.id, qtyBase, session);
          allocations = picks.map((pick) => ({ lotId: pick.lotId, qtyBase: pick.qtyBase }));
        }

        const transactions: any[] = [];
        for (const allocation of allocations) {
          await updateBalance(
            { locationId: fromLocation.id, itemId: item.id, lotId: allocation.lotId },
            -allocation.qtyBase,
            allowNegative,
            session
          );
          await updateBalance(
            { locationId: toLocation.id, itemId: item.id, lotId: allocation.lotId },
            allocation.qtyBase,
            true,
            session
          );

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'RETURN',
                tx_time: nowIso(),
                created_by: user.userId,
                from_location_id: fromLocation.id,
                to_location_id: toLocation.id,
                consumable_item_id: item.id,
                lot_id: allocation.lotId,
                container_id: null,
                qty_base: allocation.qtyBase,
                entered_qty: allocation.qtyBase,
                entered_uom: item.base_uom,
                reason_code_id: null,
                reference: payload.reference || null,
                notes: payload.notes || null,
                metadata: buildMetadata(payload, allowNegative),
              },
            ],
            { session }
          );
          transactions.push(tx[0]);
        }

        await createAuditLog(
          user.userId,
          'consumables.return',
          `Returned ${payload.qty} ${payload.uom} of ${item.name} to ${toLocation.name}`,
          { itemId: item.id, fromLocationId: fromLocation.id, toLocationId: toLocation.id },
          session
        );

        result = transactions;
      });
    } finally {
      session.endSession();
    }
    return result;
  },
  async openingBalance(user: AuthUser, payload: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canOpenBalance, 'Not permitted to set opening balances');

        const transactions: any[] = [];
        for (const entry of payload.entries) {
          const item = await getItem(entry.itemId, session);
          const location = await getLocation(entry.locationId, session);
          const qtyBase = convertToBaseQty(entry.qty, entry.uom, item.base_uom);
          if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

          const lotId: string | null = entry.lotId || null;
          if (item.requires_lot_tracking !== false) {
            if (!lotId) throw createHttpError(400, 'Lot is required for this item');
            await ensureLotMatchesItem(lotId, item.id, session);
          }

          await updateBalance(
            { locationId: location.id, itemId: item.id, lotId },
            qtyBase,
            true,
            session
          );

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'OPENING_BALANCE',
                tx_time: nowIso(),
                created_by: user.userId,
                from_location_id: null,
                to_location_id: location.id,
                consumable_item_id: item.id,
                lot_id: lotId,
                container_id: null,
                qty_base: qtyBase,
                entered_qty: entry.qty,
                entered_uom: formatUom(entry.uom),
                reason_code_id: null,
                reference: entry.reference || null,
                notes: entry.notes || null,
                metadata: entry.metadata || {},
              },
            ],
            { session }
          );
          transactions.push(tx[0]);
        }

        await createAuditLog(
          user.userId,
          'consumables.opening_balance',
          `Posted ${payload.entries.length} opening balance entries`,
          { count: payload.entries.length },
          session
        );

        result = transactions;
      });
    } finally {
      session.endSession();
    }
    return result;
  },

  async getBalance(user: AuthUser, query: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canViewReports, 'Not permitted to view balances');
        await ensureLocationAccess(user, query.locationId, session);
        result = await ConsumableInventoryBalanceModel.findOne({
          location_id: query.locationId,
          consumable_item_id: query.itemId,
          lot_id: query.lotId || null,
        }).session(session);
      });
    } finally {
      session.endSession();
    }
    return result;
  },

  async getBalances(user: AuthUser, query: any) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canViewReports, 'Not permitted to view balances');

        let allowedLocationId: string | null = null;
        const role = user.role;
        if (role !== 'super_admin' && role !== 'admin' && role !== 'auditor' && role !== 'viewer') {
          allowedLocationId = await resolveAccessibleLocationId(user.userId, role, session);
        }

        const filter: any = {};
        if (query.locationId) filter.location_id = query.locationId;
        if (query.itemId) filter.consumable_item_id = query.itemId;
        if (query.lotId) filter.lot_id = query.lotId;

        if (allowedLocationId) {
          if (filter.location_id && filter.location_id !== allowedLocationId) {
            throw createHttpError(403, 'User does not have access to this location');
          }
          filter.location_id = allowedLocationId;
        }

        result = await ConsumableInventoryBalanceModel.find(filter).sort({ updated_at: -1 }).session(session);
      });
    } finally {
      session.endSession();
    }
    return result;
  },
  async getRollup(user: AuthUser, query: any) {
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view rollup');

    const match: any = {};
    if (query.itemId) match.consumable_item_id = new mongoose.Types.ObjectId(query.itemId);
    const allowedLocationId = await resolveAccessibleLocationId(user.userId, user.role);
    if (allowedLocationId) {
      match.location_id = new mongoose.Types.ObjectId(allowedLocationId);
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            itemId: '$consumable_item_id',
            locationId: '$location_id',
          },
          qty_on_hand_base: { $sum: '$qty_on_hand_base' },
        },
      },
    ];

    const grouped = await ConsumableInventoryBalanceModel.aggregate(pipeline);
    const rollupMap = new Map<string, { itemId: string; totalQtyBase: number; byLocation: any[] }>();

    for (const row of grouped) {
      const itemId = row._id.itemId.toString();
      const locationId = row._id.locationId.toString();
      const entry = rollupMap.get(itemId) || { itemId, totalQtyBase: 0, byLocation: [] };
      entry.totalQtyBase += row.qty_on_hand_base || 0;
      entry.byLocation.push({ locationId, qtyOnHandBase: row.qty_on_hand_base || 0 });
      rollupMap.set(itemId, entry);
    }

    return Array.from(rollupMap.values());
  },

  async getLedger(user: AuthUser, query: any) {
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view ledger');

    const filter: any = {};
    if (query.from || query.to) {
      filter.tx_time = {};
      if (query.from) filter.tx_time.$gte = query.from;
      if (query.to) filter.tx_time.$lte = query.to;
    }
    if (query.itemId) filter.consumable_item_id = query.itemId;
    if (query.lotId) filter.lot_id = query.lotId;
    if (query.txType) filter.tx_type = query.txType;
    const allowedLocationId = await resolveAccessibleLocationId(user.userId, user.role);
    if (allowedLocationId) {
      if (query.locationId && query.locationId !== allowedLocationId) {
        throw createHttpError(403, 'User does not have access to this location');
      }
      filter.$or = [
        { from_location_id: allowedLocationId },
        { to_location_id: allowedLocationId },
      ];
    } else if (query.locationId) {
      filter.$or = [
        { from_location_id: query.locationId },
        { to_location_id: query.locationId },
      ];
    }

    return ConsumableInventoryTransactionModel.find(filter).sort({ tx_time: -1 });
  },

  async getExpiry(user: AuthUser, query: any) {
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view expiry dashboard');

    const days = query.days ? Number(query.days) : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const balanceFilter: any = { qty_on_hand_base: { $gt: 0 } };
    const allowedLocationId = await resolveAccessibleLocationId(user.userId, user.role);
    if (allowedLocationId) {
      if (query.locationId && query.locationId !== allowedLocationId) {
        throw createHttpError(403, 'User does not have access to this location');
      }
      balanceFilter.location_id = allowedLocationId;
    } else if (query.locationId) {
      balanceFilter.location_id = query.locationId;
    }

    const balances = await ConsumableInventoryBalanceModel.find(balanceFilter);
    const lotIds = balances
      .map((balance) => balance.lot_id?.toString())
      .filter((id): id is string => Boolean(id));

    const lots = await ConsumableLotModel.find({ _id: { $in: lotIds } });
    const lotMap = new Map(lots.map((lot) => [lot.id.toString(), lot]));

    const expiring: any[] = [];
    for (const balance of balances) {
      if (!balance.lot_id) continue;
      const lot = lotMap.get(balance.lot_id.toString());
      if (!lot?.expiry_date) continue;
      const expiryDate = new Date(lot.expiry_date);
      if (expiryDate <= cutoff) {
        expiring.push({
          lotId: lot.id,
          itemId: lot.consumable_item_id,
          locationId: balance.location_id,
          expiryDate: lot.expiry_date,
          qtyOnHandBase: balance.qty_on_hand_base,
        });
      }
    }

    return expiring.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  },
};
