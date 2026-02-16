// @ts-nocheck
import mongoose, { ClientSession } from 'mongoose';
import { ActivityLogModel } from '../../../models/activityLog.model';
import { OfficeModel } from '../../../models/office.model';
import { StoreModel } from '../../../models/store.model';
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
import { supportsChemicals } from '../utils/officeCapabilities';
import { getUnitLookup } from './consumableUnit.service';
import { roundQty } from './balance.service';

const HEAD_OFFICE_STORE_CODE = 'HEAD_OFFICE_STORE';
const HOLDER_TYPES = ['OFFICE', 'STORE'] as const;
type HolderType = (typeof HOLDER_TYPES)[number];

type AuthUser = {
  userId: string;
  role: string;
  email: string;
};

type AuditMeta = Record<string, unknown> | undefined;

type BalanceKey = {
  holderType?: HolderType | null;
  holderId?: string | null;
  itemId: string;
  lotId?: string | null;
};

type HolderContext = {
  holderType: HolderType;
  holderId: string;
  name: string;
  office?: unknown;
  store?: any;
};

const nowIso = () => new Date().toISOString();

function ensureAllowed(condition: boolean, message: string) {
  if (!condition) throw createHttpError(403, message);
}

function ensureChemicalsHolder(item: any, holder: HolderContext, label: string) {
  if (!item?.is_chemical) return;
  if (holder.holderType === 'STORE') return;
  if (!supportsChemicals(holder.office)) {
    throw createHttpError(400, `${label} must be a lab-enabled chemical location`);
  }
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

async function getStore(storeId: string, session?: ClientSession) {
  const store = await StoreModel.findById(storeId).session(session || null);
  if (!store) throw createHttpError(404, 'Store not found');
  return store;
}

async function resolveHeadOfficeStore(session?: ClientSession) {
  const store = await StoreModel.findOne({ code: HEAD_OFFICE_STORE_CODE, is_active: { $ne: false } }).session(
    session || null
  );
  if (!store) throw createHttpError(500, 'HEAD_OFFICE_STORE is not configured');
  return store;
}

function normalizeHolderType(value: unknown, fallback: HolderType = 'OFFICE'): HolderType {
  const candidate = String(value || fallback).trim().toUpperCase();
  return candidate === 'STORE' ? 'STORE' : 'OFFICE';
}

function officeHolderFilter(holderId: string) {
  return { holder_type: 'OFFICE', holder_id: holderId };
}

function balanceHolderFilter(holderType: HolderType, holderId: string) {
  if (holderType === 'OFFICE') {
    return officeHolderFilter(holderId);
  }
  return { holder_type: 'STORE', holder_id: holderId };
}

function txHolderUpdate(holderType: HolderType, holderId: string, direction: 'from' | 'to') {
  if (direction === 'from') {
    return {
      from_holder_type: holderType,
      from_holder_id: holderId,
    };
  }
  return {
    to_holder_type: holderType,
    to_holder_id: holderId,
  };
}

function resolveBalanceHolder(key: BalanceKey): { holderType: HolderType; holderId: string } {
  if (key.holderType && key.holderId) {
    return {
      holderType: normalizeHolderType(key.holderType),
      holderId: String(key.holderId),
    };
  }
  if (key.holderId) {
    return {
      holderType: normalizeHolderType(key.holderType),
      holderId: String(key.holderId),
    };
  }
  throw createHttpError(400, 'Balance holder is required');
}

async function resolveHolder(
  holderId: string,
  holderTypeInput: unknown,
  session?: ClientSession
): Promise<HolderContext> {
  const holderType = normalizeHolderType(holderTypeInput);
  if (holderType === 'STORE') {
    const store = /^[a-f\d]{24}$/i.test(holderId)
      ? await getStore(holderId, session)
      : await StoreModel.findOne({ code: holderId, is_active: { $ne: false } }).session(session || null);
    if (!store) throw createHttpError(404, 'Store not found');
    return {
      holderType,
      holderId: store.id,
      name: String(store.name || store.code || 'Store'),
      store,
    };
  }
  const office = await getLocation(holderId, session);
  return {
    holderType: 'OFFICE',
    holderId: office.id,
    name: String(office.name || 'Location'),
    office,
  };
}

function isGlobalConsumableRole(role?: string | null) {
  return role === 'org_admin';
}

function extractHolderArgs(
  payload: any,
  options: {
    holderIdKey: string;
    holderTypeKey: string;
    defaultType?: HolderType;
  }
) {
  const holderId = String(payload?.[options.holderIdKey] || '').trim();
  const inferredType: HolderType = options.defaultType || 'OFFICE';
  const holderType = normalizeHolderType(payload?.[options.holderTypeKey], inferredType);
  if (!holderId) {
    throw createHttpError(400, `${options.holderIdKey} is required`);
  }
  return { holderId, holderType };
}

function withAnd(base: any, clause: any) {
  if (!clause || Object.keys(clause).length === 0) return base;
  if (!base || Object.keys(base).length === 0) return clause;
  return { $and: [base, clause] };
}

function txAnySideHolderFilter(holderType: HolderType, holderId: string) {
  if (holderType === 'STORE') {
    return {
      $or: [
        { from_holder_type: 'STORE', from_holder_id: holderId },
        { to_holder_type: 'STORE', to_holder_id: holderId },
      ],
    };
  }
  return {
    $or: [
      { from_holder_type: 'OFFICE', from_holder_id: holderId },
      { to_holder_type: 'OFFICE', to_holder_id: holderId },
    ],
  };
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

async function getBalance(key: BalanceKey, session: ClientSession) {
  const holder = resolveBalanceHolder(key);
  const keyFilter = balanceHolderFilter(holder.holderType, holder.holderId);
  return ConsumableInventoryBalanceModel.findOne({
    ...keyFilter,
    consumable_item_id: key.itemId,
    lot_id: key.lotId ?? null,
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
    const holder = resolveBalanceHolder(key);
    const created = await ConsumableInventoryBalanceModel.create(
      [
        {
          holder_type: holder.holderType,
          holder_id: holder.holderId,
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
  if (isGlobalConsumableRole(role)) {
    return null;
  }
  const user = await getUserContext(userId, session);
  return user.location_id?.toString() || null;
}

async function pickLotsByFefo(
  holderType: HolderType,
  holderId: string,
  itemId: string,
  qtyBase: number,
  session: ClientSession
) {
  const holderFilter = balanceHolderFilter(holderType, holderId);
  const balances = await ConsumableInventoryBalanceModel.find({
    ...holderFilter,
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
  const lotItemId = lot.consumable_id ? String(lot.consumable_id) : '';
  if (lotItemId !== itemId) {
    throw createHttpError(400, 'Lot does not belong to consumable item');
  }
  return lot;
}

async function ensureContainerMatchesItem(containerId: string, itemId: string, session: ClientSession) {
  const container = await getContainer(containerId, session);
  const lot = await getLot(container.lot_id.toString(), session);
  const lotItemId = lot.consumable_id ? String(lot.consumable_id) : '';
  if (lotItemId !== itemId) {
    throw createHttpError(400, 'Container does not belong to consumable item');
  }
  return container;
}

async function ensureLocationAccess(user: AuthUser, locationId: string, session?: ClientSession) {
  if (isGlobalConsumableRole(user.role)) {
    return;
  }
  const userContext = await getUserContext(user.userId, session);
  if (!userContext.location_id) {
    throw createHttpError(403, 'User is not assigned to a location');
  }
  if (userContext.location_id.toString() !== locationId) {
    throw createHttpError(403, 'User does not have access to this location');
  }
}

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

async function ensureOfficeHolderAccess(user: AuthUser, holder: HolderContext, session?: ClientSession) {
  if (holder.holderType !== 'OFFICE') return;
  await ensureLocationAccess(user, holder.holderId, session);
}

async function getCentralStoreHolder(session: ClientSession) {
  const store = await resolveHeadOfficeStore(session);
  return {
    holderType: 'STORE' as const,
    holderId: store.id,
    name: String(store.name || store.code || 'Head Office Store'),
    store,
  };
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
        const storeHolder = await getCentralStoreHolder(session);
        const unitLookup = await getUnitLookup({ session });
        ensureChemicalsHolder(item, storeHolder, 'Receiving holder');

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom, unitLookup);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

        let lotId: string | null = payload.lotId || null;
        if (lotId) {
          await ensureLotMatchesItem(lotId, item.id, session);
        } else if (item.requires_lot_tracking !== false) {
          if (!payload.lot) throw createHttpError(400, 'Lot details are required for this item');
          if (!payload.lot.expiryDate) throw createHttpError(400, 'Lot expiry date is required');
          const expiryDate = new Date(payload.lot.expiryDate);
          if (Number.isNaN(expiryDate.getTime())) {
            throw createHttpError(400, 'Lot expiry date is invalid');
          }
          const receivedQty = roundQty(qtyBase);
          const newLot = await ConsumableLotModel.create(
            [
              {
                consumable_id: item.id,
                holder_type: storeHolder.holderType,
                holder_id: storeHolder.holderId,
                batch_no: payload.lot.lotNumber,
                supplier_id: payload.lot.supplierId || null,
                received_at: new Date(payload.lot.receivedDate || nowIso()),
                expiry_date: expiryDate,
                qty_received: receivedQty,
                qty_available: receivedQty,
                received_by_user_id: user.userId,
                notes: payload.notes || null,
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
              ...txHolderUpdate(storeHolder.holderType, storeHolder.holderId, 'to'),
              consumable_item_id: item.id,
              lot_id: lotId,
              container_id: null,
              qty_base: qtyBase,
              entered_qty: payload.qty,
              entered_uom: formatUom(payload.uom, unitLookup),
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
            holderType: storeHolder.holderType,
            holderId: storeHolder.holderId,
            itemId: item.id,
            lotId,
          },
          qtyBase,
          true,
          session
        );

        if (Array.isArray(payload.containers) && payload.containers.length > 0) {
          const sumContainers = payload.containers.reduce((total: number, container: any) => {
            return total + convertToBaseQty(container.initialQty, payload.uom, item.base_uom, unitLookup);
          }, 0);
          const diff = Math.abs(sumContainers - qtyBase);
          if (diff > 0.0001) {
            throw createHttpError(400, 'Container quantities must sum to total received quantity');
          }
          await ConsumableContainerModel.insertMany(
            payload.containers.map((container: any) => ({
              lot_id: lotId,
              container_code: container.containerCode,
              initial_qty_base: convertToBaseQty(container.initialQty, payload.uom, item.base_uom, unitLookup),
              current_qty_base: convertToBaseQty(container.initialQty, payload.uom, item.base_uom, unitLookup),
              current_location_id: storeHolder.holderId,
              status: 'IN_STOCK',
              opened_date: container.openedDate || null,
            })),
            { session }
          );
        }

        await createAuditLog(
          user.userId,
          'consumables.receive',
          `Received ${payload.qty} ${payload.uom} of ${item.name} into ${storeHolder.name}`,
          {
            itemId: item.id,
            holderType: storeHolder.holderType,
            holderId: storeHolder.holderId,
            locationId: null,
            lotId,
            qtyBase,
          },
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
        const fromHolderId = String(payload.fromHolderId || '').trim();
        const toHolderId = String(payload.toHolderId || '').trim();
        if (!fromHolderId || !toHolderId) {
          throw createHttpError(400, 'fromHolderId/toHolderId are required');
        }
        const fromHolder = await resolveHolder(fromHolderId, payload.fromHolderType || 'OFFICE', session);
        const toHolder = await resolveHolder(toHolderId, payload.toHolderType || 'OFFICE', session);
        const unitLookup = await getUnitLookup({ session });
        ensureChemicalsHolder(item, fromHolder, 'From holder');
        ensureChemicalsHolder(item, toHolder, 'To holder');

        if (fromHolder.holderType === 'STORE') {
          ensureAllowed(permissions.canTransferCentral, 'Not permitted to transfer from Central Store');
        } else {
          ensureAllowed(permissions.canTransferLab, 'Not permitted to transfer between labs');
          await ensureOfficeHolderAccess(user, fromHolder, session);
        }

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom, unitLookup);
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
          if (container.current_location_id.toString() !== fromHolder.holderId) {
            throw createHttpError(400, 'Container is not at the source location');
          }
          const containerQty = container.current_qty_base || 0;
          if (Math.abs(containerQty - qtyBase) > 0.0001) {
            throw createHttpError(400, 'Container transfers must move the full container quantity');
          }

          await updateBalance(
            {
              holderType: fromHolder.holderType,
              holderId: fromHolder.holderId,
              itemId: item.id,
              lotId: container.lot_id.toString(),
            },
            -containerQty,
            allowNegative,
            session
          );
          await updateBalance(
            {
              holderType: toHolder.holderType,
              holderId: toHolder.holderId,
              itemId: item.id,
              lotId: container.lot_id.toString(),
            },
            containerQty,
            true,
            session
          );

          container.current_location_id = toHolder.holderId;
          await container.save({ session });

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'TRANSFER',
                tx_time: nowIso(),
                created_by: user.userId,
                ...txHolderUpdate(fromHolder.holderType, fromHolder.holderId, 'from'),
                ...txHolderUpdate(toHolder.holderType, toHolder.holderId, 'to'),
                consumable_item_id: item.id,
                lot_id: container.lot_id,
                container_id: container.id,
                qty_base: containerQty,
                entered_qty: payload.qty,
                entered_uom: formatUom(payload.uom, unitLookup),
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
            `Transferred ${payload.qty} ${payload.uom} of ${item.name} from ${fromHolder.name} to ${toHolder.name}`,
            {
              itemId: item.id,
              fromHolderType: fromHolder.holderType,
              fromHolderId: fromHolder.holderId,
              toHolderType: toHolder.holderType,
              toHolderId: toHolder.holderId,
              lotId: container.lot_id,
            },
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
          const picks = await pickLotsByFefo(fromHolder.holderType, fromHolder.holderId, item.id, qtyBase, session);
          allocations = picks.map((pick) => ({ lotId: pick.lotId, qtyBase: pick.qtyBase }));
        }

        const transactions: any[] = [];
        for (const allocation of allocations) {
          await updateBalance(
            {
              holderType: fromHolder.holderType,
              holderId: fromHolder.holderId,
              itemId: item.id,
              lotId: allocation.lotId,
            },
            -allocation.qtyBase,
            allowNegative,
            session
          );
          await updateBalance(
            {
              holderType: toHolder.holderType,
              holderId: toHolder.holderId,
              itemId: item.id,
              lotId: allocation.lotId,
            },
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
                ...txHolderUpdate(fromHolder.holderType, fromHolder.holderId, 'from'),
                ...txHolderUpdate(toHolder.holderType, toHolder.holderId, 'to'),
                consumable_item_id: item.id,
                lot_id: allocation.lotId,
                container_id: null,
                qty_base: allocation.qtyBase,
                entered_qty: allocation.qtyBase,
                entered_uom: formatUom(item.base_uom, unitLookup),
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
          `Transferred ${payload.qty} ${payload.uom} of ${item.name} from ${fromHolder.name} to ${toHolder.name}`,
          {
            itemId: item.id,
            fromHolderType: fromHolder.holderType,
            fromHolderId: fromHolder.holderId,
            toHolderType: toHolder.holderType,
            toHolderId: toHolder.holderId,
          },
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
        const { holderId, holderType } = extractHolderArgs(payload, {
          holderIdKey: 'holderId',
          holderTypeKey: 'holderType',
        });
        const holder = await resolveHolder(holderId, holderType, session);
        const unitLookup = await getUnitLookup({ session });
        ensureChemicalsHolder(item, holder, 'Consumption holder');
        await ensureOfficeHolderAccess(user, holder, session);

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom, unitLookup);
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
          if (container.current_location_id.toString() !== holder.holderId) {
            throw createHttpError(400, 'Container is not at the selected holder');
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
            {
              holderType: holder.holderType,
              holderId: holder.holderId,
              itemId: item.id,
              lotId: container.lot_id.toString(),
            },
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
                ...txHolderUpdate(holder.holderType, holder.holderId, 'from'),
                consumable_item_id: item.id,
                lot_id: container.lot_id,
                container_id: container.id,
                qty_base: qtyBase,
                entered_qty: payload.qty,
                entered_uom: formatUom(payload.uom, unitLookup),
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
            `Consumed ${payload.qty} ${payload.uom} of ${item.name} at ${holder.name}`,
            {
              itemId: item.id,
              holderType: holder.holderType,
              holderId: holder.holderId,
              locationId: holder.holderType === 'OFFICE' ? holder.holderId : null,
              lotId: container.lot_id,
            },
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
          const picks = await pickLotsByFefo(holder.holderType, holder.holderId, item.id, qtyBase, session);
          allocations = picks.map((pick) => ({ lotId: pick.lotId, qtyBase: pick.qtyBase }));
        }

        const transactions: any[] = [];
        for (const allocation of allocations) {
          await updateBalance(
            {
              holderType: holder.holderType,
              holderId: holder.holderId,
              itemId: item.id,
              lotId: allocation.lotId,
            },
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
                ...txHolderUpdate(holder.holderType, holder.holderId, 'from'),
                consumable_item_id: item.id,
                lot_id: allocation.lotId,
                container_id: null,
                qty_base: allocation.qtyBase,
                entered_qty: allocation.qtyBase,
                entered_uom: formatUom(item.base_uom, unitLookup),
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
          `Consumed ${payload.qty} ${payload.uom} of ${item.name} at ${holder.name}`,
          {
            itemId: item.id,
            holderType: holder.holderType,
            holderId: holder.holderId,
            locationId: holder.holderType === 'OFFICE' ? holder.holderId : null,
          },
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
        const { holderId, holderType } = extractHolderArgs(payload, {
          holderIdKey: 'holderId',
          holderTypeKey: 'holderType',
        });
        const holder = await resolveHolder(holderId, holderType, session);
        const unitLookup = await getUnitLookup({ session });
        ensureChemicalsHolder(item, holder, 'Adjustment holder');
        await ensureOfficeHolderAccess(user, holder, session);

        await verifyReasonCode(payload.reasonCodeId, 'ADJUST', session);

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom, unitLookup);
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
          if (container.current_location_id.toString() !== holder.holderId) {
            throw createHttpError(400, 'Container is not at the selected holder');
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
          { holderType: holder.holderType, holderId: holder.holderId, itemId: item.id, lotId },
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
              ...(direction < 0 ? txHolderUpdate(holder.holderType, holder.holderId, 'from') : {}),
              ...(direction > 0 ? txHolderUpdate(holder.holderType, holder.holderId, 'to') : {}),
              consumable_item_id: item.id,
              lot_id: lotId,
              container_id: payload.containerId || null,
              qty_base: qtyBase,
              entered_qty: payload.qty,
              entered_uom: formatUom(payload.uom, unitLookup),
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
          `Adjusted ${payload.qty} ${payload.uom} of ${item.name} at ${holder.name}`,
          {
            itemId: item.id,
            holderType: holder.holderType,
            holderId: holder.holderId,
            locationId: holder.holderType === 'OFFICE' ? holder.holderId : null,
            lotId,
            direction,
          },
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
        const { holderId, holderType } = extractHolderArgs(payload, {
          holderIdKey: 'holderId',
          holderTypeKey: 'holderType',
        });
        const holder = await resolveHolder(holderId, holderType, session);
        const unitLookup = await getUnitLookup({ session });
        ensureChemicalsHolder(item, holder, 'Disposal holder');
        await ensureOfficeHolderAccess(user, holder, session);

        await verifyReasonCode(payload.reasonCodeId, 'DISPOSE', session);

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom, unitLookup);
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
          if (container.current_location_id.toString() !== holder.holderId) {
            throw createHttpError(400, 'Container is not at the selected holder');
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
          { holderType: holder.holderType, holderId: holder.holderId, itemId: item.id, lotId },
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
              ...txHolderUpdate(holder.holderType, holder.holderId, 'from'),
              consumable_item_id: item.id,
              lot_id: lotId,
              container_id: payload.containerId || null,
              qty_base: qtyBase,
              entered_qty: payload.qty,
              entered_uom: formatUom(payload.uom, unitLookup),
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
          `Disposed ${payload.qty} ${payload.uom} of ${item.name} at ${holder.name}`,
          {
            itemId: item.id,
            holderType: holder.holderType,
            holderId: holder.holderId,
            locationId: holder.holderType === 'OFFICE' ? holder.holderId : null,
            lotId,
          },
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
        const fromArgs = extractHolderArgs(payload, {
          holderIdKey: 'fromHolderId',
          holderTypeKey: 'fromHolderType',
        });
        const fromHolder = await resolveHolder(fromArgs.holderId, fromArgs.holderType, session);
        if (fromHolder.holderType !== 'OFFICE') {
          throw createHttpError(400, 'Returns must originate from an office holder');
        }
        await ensureOfficeHolderAccess(user, fromHolder, session);

        const toSystemStore = await getCentralStoreHolder(session);
        let toHolder = toSystemStore;
        if (payload.toHolderId) {
          const toArgs = extractHolderArgs(payload, {
            holderIdKey: 'toHolderId',
            holderTypeKey: 'toHolderType',
          });
          toHolder = await resolveHolder(toArgs.holderId, toArgs.holderType, session);
        }
        if (toHolder.holderType !== 'STORE' || toHolder.holderId !== toSystemStore.holderId) {
          throw createHttpError(400, 'Returns must be sent to HEAD_OFFICE_STORE');
        }

        const unitLookup = await getUnitLookup({ session });
        ensureChemicalsHolder(item, fromHolder, 'Return source holder');
        ensureChemicalsHolder(item, toHolder, 'Return destination holder');

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom, unitLookup);
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
          if (container.current_location_id.toString() !== fromHolder.holderId) {
            throw createHttpError(400, 'Container is not at the source holder');
          }
          const containerQty = container.current_qty_base || 0;
          if (Math.abs(containerQty - qtyBase) > 0.0001) {
            throw createHttpError(400, 'Container returns must move the full container quantity');
          }

          await updateBalance(
            {
              holderType: fromHolder.holderType,
              holderId: fromHolder.holderId,
              itemId: item.id,
              lotId: container.lot_id.toString(),
            },
            -containerQty,
            allowNegative,
            session
          );
          await updateBalance(
            {
              holderType: toHolder.holderType,
              holderId: toHolder.holderId,
              itemId: item.id,
              lotId: container.lot_id.toString(),
            },
            containerQty,
            true,
            session
          );

          container.current_location_id = toHolder.holderId;
          await container.save({ session });

          const tx = await ConsumableInventoryTransactionModel.create(
            [
              {
                tx_type: 'RETURN',
                tx_time: nowIso(),
                created_by: user.userId,
                ...txHolderUpdate(fromHolder.holderType, fromHolder.holderId, 'from'),
                ...txHolderUpdate(toHolder.holderType, toHolder.holderId, 'to'),
                consumable_item_id: item.id,
                lot_id: container.lot_id,
                container_id: container.id,
                qty_base: containerQty,
                entered_qty: payload.qty,
                entered_uom: formatUom(payload.uom, unitLookup),
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
            `Returned ${payload.qty} ${payload.uom} of ${item.name} to ${toHolder.name}`,
            {
              itemId: item.id,
              fromHolderType: fromHolder.holderType,
              fromHolderId: fromHolder.holderId,
              toHolderType: toHolder.holderType,
              toHolderId: toHolder.holderId,
            },
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
          const picks = await pickLotsByFefo(fromHolder.holderType, fromHolder.holderId, item.id, qtyBase, session);
          allocations = picks.map((pick) => ({ lotId: pick.lotId, qtyBase: pick.qtyBase }));
        }

        const transactions: any[] = [];
        for (const allocation of allocations) {
          await updateBalance(
            {
              holderType: fromHolder.holderType,
              holderId: fromHolder.holderId,
              itemId: item.id,
              lotId: allocation.lotId,
            },
            -allocation.qtyBase,
            allowNegative,
            session
          );
          await updateBalance(
            {
              holderType: toHolder.holderType,
              holderId: toHolder.holderId,
              itemId: item.id,
              lotId: allocation.lotId,
            },
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
                ...txHolderUpdate(fromHolder.holderType, fromHolder.holderId, 'from'),
                ...txHolderUpdate(toHolder.holderType, toHolder.holderId, 'to'),
                consumable_item_id: item.id,
                lot_id: allocation.lotId,
                container_id: null,
                qty_base: allocation.qtyBase,
                entered_qty: allocation.qtyBase,
                entered_uom: formatUom(item.base_uom, unitLookup),
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
          `Returned ${payload.qty} ${payload.uom} of ${item.name} to ${toHolder.name}`,
          {
            itemId: item.id,
            fromHolderType: fromHolder.holderType,
            fromHolderId: fromHolder.holderId,
            toHolderType: toHolder.holderType,
            toHolderId: toHolder.holderId,
          },
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

        const unitLookup = await getUnitLookup({ session });
        const transactions: any[] = [];
        for (const entry of payload.entries) {
          const item = await getItem(entry.itemId, session);
          const holderArgs = extractHolderArgs(entry, {
            holderIdKey: 'holderId',
            holderTypeKey: 'holderType',
          });
          const holder = await resolveHolder(holderArgs.holderId, holderArgs.holderType, session);
          ensureChemicalsHolder(item, holder, 'Opening balance holder');
          await ensureOfficeHolderAccess(user, holder, session);
          const qtyBase = convertToBaseQty(entry.qty, entry.uom, item.base_uom, unitLookup);
          if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

          const lotId: string | null = entry.lotId || null;
          if (item.requires_lot_tracking !== false) {
            if (!lotId) throw createHttpError(400, 'Lot is required for this item');
            await ensureLotMatchesItem(lotId, item.id, session);
          }

          await updateBalance(
            {
              holderType: holder.holderType,
              holderId: holder.holderId,
              itemId: item.id,
              lotId,
            },
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
                ...txHolderUpdate(holder.holderType, holder.holderId, 'to'),
                consumable_item_id: item.id,
                lot_id: lotId,
                container_id: null,
                qty_base: qtyBase,
                entered_qty: entry.qty,
                entered_uom: formatUom(entry.uom, unitLookup),
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
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view balances');

    const holderArgs = extractHolderArgs(query, {
      holderIdKey: 'holderId',
      holderTypeKey: 'holderType',
    });
    if (holderArgs.holderType === 'OFFICE') {
      await ensureLocationAccess(user, holderArgs.holderId);
    } else if (!isGlobalConsumableRole(user.role)) {
      throw createHttpError(403, 'User does not have access to store balances');
    }

    return ConsumableInventoryBalanceModel.findOne({
      ...balanceHolderFilter(holderArgs.holderType, holderArgs.holderId),
      consumable_item_id: query.itemId,
      lot_id: query.lotId || null,
    });
  },

  async getBalances(user: AuthUser, query: any) {
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view balances');

    const role = user.role;
    const allowedLocationId = await resolveAccessibleLocationId(user.userId, role);

    let filter: any = {};
    if (query.holderId) {
      const holderArgs = extractHolderArgs(query, {
        holderIdKey: 'holderId',
        holderTypeKey: 'holderType',
      });
      filter = withAnd(filter, balanceHolderFilter(holderArgs.holderType, holderArgs.holderId));
    }
    if (query.itemId) filter.consumable_item_id = query.itemId;
    if (query.lotId) filter.lot_id = query.lotId;

    if (allowedLocationId) {
      const allowedOfficeFilter = officeHolderFilter(allowedLocationId);
      if (query.holderId && normalizeHolderType(query.holderType || 'OFFICE') === 'STORE') {
        throw createHttpError(403, 'User does not have access to this store');
      }
      if (
        query.holderId &&
        normalizeHolderType(query.holderType || 'OFFICE') === 'OFFICE' &&
        query.holderId !== allowedLocationId
      ) {
        throw createHttpError(403, 'User does not have access to this location');
      }
      filter = withAnd(filter, allowedOfficeFilter);
    }

    const limit = clampInt(query.limit, 500, 2000);
    const page = clampInt(query.page, 1, 10_000);

    return ConsumableInventoryBalanceModel.find(filter)
      .sort({ updated_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
  },
  async getRollup(user: AuthUser, query: any) {
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view rollup');

    let match: any = {};
    if (query.itemId) match.consumable_item_id = new mongoose.Types.ObjectId(query.itemId);
    if (query.holderId) {
      const holderArgs = extractHolderArgs(query, {
        holderIdKey: 'holderId',
        holderTypeKey: 'holderType',
      });
      match = withAnd(match, balanceHolderFilter(holderArgs.holderType, holderArgs.holderId));
    }

    const allowedLocationId = await resolveAccessibleLocationId(user.userId, user.role);
    if (allowedLocationId) {
      if (query.holderId && normalizeHolderType(query.holderType || 'OFFICE') === 'STORE') {
        throw createHttpError(403, 'User does not have access to this store');
      }
      if (
        query.holderId &&
        normalizeHolderType(query.holderType || 'OFFICE') === 'OFFICE' &&
        query.holderId !== allowedLocationId
      ) {
        throw createHttpError(403, 'User does not have access to this location');
      }
      match = withAnd(match, officeHolderFilter(allowedLocationId));
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            itemId: '$consumable_item_id',
            holderType: { $ifNull: ['$holder_type', 'OFFICE'] },
            holderId: '$holder_id',
          },
          qty_on_hand_base: { $sum: '$qty_on_hand_base' },
        },
      },
    ];

    const grouped = await ConsumableInventoryBalanceModel.aggregate(pipeline);
    const rollupMap = new Map<string, { itemId: string; totalQtyBase: number; byLocation: any[]; byHolder: any[] }>();

    for (const row of grouped) {
      const itemId = row._id.itemId.toString();
      const holderType = row._id.holderType === 'STORE' ? 'STORE' : 'OFFICE';
      const holderId = row._id.holderId?.toString();
      if (!holderId) continue;
      const entry = rollupMap.get(itemId) || { itemId, totalQtyBase: 0, byLocation: [], byHolder: [] };
      entry.totalQtyBase += row.qty_on_hand_base || 0;
      entry.byHolder.push({ holderType, holderId, qtyOnHandBase: row.qty_on_hand_base || 0 });
      if (holderType === 'OFFICE') {
        entry.byLocation.push({ locationId: holderId, qtyOnHandBase: row.qty_on_hand_base || 0 });
      }
      rollupMap.set(itemId, entry);
    }

    return Array.from(rollupMap.values());
  },

  async getLedger(user: AuthUser, query: any) {
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view ledger');

    let filter: any = {};
    if (query.from || query.to) {
      filter.tx_time = {};
      if (query.from) filter.tx_time.$gte = query.from;
      if (query.to) filter.tx_time.$lte = query.to;
    }
    if (query.itemId) filter.consumable_item_id = query.itemId;
    if (query.lotId) filter.lot_id = query.lotId;
    if (query.txType) filter.tx_type = query.txType;

    if (query.holderId) {
      const holderArgs = extractHolderArgs(query, {
        holderIdKey: 'holderId',
        holderTypeKey: 'holderType',
      });
      filter = withAnd(filter, txAnySideHolderFilter(holderArgs.holderType, holderArgs.holderId));
    }

    const allowedLocationId = await resolveAccessibleLocationId(user.userId, user.role);
    if (allowedLocationId) {
      if (query.holderId && normalizeHolderType(query.holderType || 'OFFICE') === 'STORE') {
        throw createHttpError(403, 'User does not have access to this store');
      }
      if (
        query.holderId &&
        normalizeHolderType(query.holderType || 'OFFICE') === 'OFFICE' &&
        query.holderId !== allowedLocationId
      ) {
        throw createHttpError(403, 'User does not have access to this location');
      }
      filter = withAnd(filter, txAnySideHolderFilter('OFFICE', allowedLocationId));
    }

    const limit = clampInt(query.limit, 200, 1000);
    const page = clampInt(query.page, 1, 10_000);

    return ConsumableInventoryTransactionModel.find(filter)
      .sort({ tx_time: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
  },

  async getExpiry(user: AuthUser, query: any) {
    const permissions = resolveConsumablePermissions(user.role);
    ensureAllowed(permissions.canViewReports, 'Not permitted to view expiry dashboard');

    const days = query.days ? Number(query.days) : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    let balanceFilter: any = { qty_on_hand_base: { $gt: 0 } };
    if (query.holderId) {
      const holderArgs = extractHolderArgs(query, {
        holderIdKey: 'holderId',
        holderTypeKey: 'holderType',
      });
      balanceFilter = withAnd(balanceFilter, balanceHolderFilter(holderArgs.holderType, holderArgs.holderId));
    }
    const allowedLocationId = await resolveAccessibleLocationId(user.userId, user.role);
    if (allowedLocationId) {
      if (query.holderId && normalizeHolderType(query.holderType || 'OFFICE') === 'STORE') {
        throw createHttpError(403, 'User does not have access to this store');
      }
      if (
        query.holderId &&
        normalizeHolderType(query.holderType || 'OFFICE') === 'OFFICE' &&
        query.holderId !== allowedLocationId
      ) {
        throw createHttpError(403, 'User does not have access to this location');
      }
      balanceFilter = withAnd(balanceFilter, officeHolderFilter(allowedLocationId));
    }

    const balanceLimit = clampInt(query.limit, 1000, 5000);
    const balances = await ConsumableInventoryBalanceModel.find(balanceFilter).limit(balanceLimit);
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
        const holderType = balance.holder_type || null;
        const holderId = balance.holder_id || null;
        expiring.push({
          lotId: lot.id,
          itemId: String(lot.consumable_id),
          holderType,
          holderId,
          locationId: holderType === 'OFFICE' ? holderId : null,
          expiryDate: lot.expiry_date,
          qtyOnHandBase: balance.qty_on_hand_base,
        });
      }
    }

    return expiring.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  },
};


