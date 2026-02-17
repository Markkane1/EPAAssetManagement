// @ts-nocheck
import mongoose, { ClientSession } from 'mongoose';
import path from 'path';
import { ActivityLogModel } from '../../../models/activityLog.model';
import { OfficeModel } from '../../../models/office.model';
import { StoreModel } from '../../../models/store.model';
import { UserModel } from '../../../models/user.model';
import { EmployeeModel } from '../../../models/employee.model';
import { OfficeSubLocationModel } from '../../../models/officeSubLocation.model';
import { CategoryModel } from '../../../models/category.model';
import { VendorModel } from '../../../models/vendor.model';
import { ProjectModel } from '../../../models/project.model';
import { SchemeModel } from '../../../models/scheme.model';
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
const HOLDER_TYPES = ['OFFICE', 'STORE', 'EMPLOYEE', 'SUB_LOCATION'] as const;
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
  officeId?: string | null;
  office?: unknown;
  store?: any;
  employee?: any;
  subLocation?: any;
};

function resolveHolderOfficeId(holder: HolderContext) {
  if (holder.holderType === 'OFFICE') return holder.holderId;
  if (holder.holderType === 'STORE') return null;
  return holder.officeId || null;
}

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

async function getEmployee(employeeId: string, session?: ClientSession) {
  const employee = await EmployeeModel.findById(employeeId).session(session || null);
  if (!employee) throw createHttpError(404, 'Employee not found');
  return employee;
}

async function getSubLocation(subLocationId: string, session?: ClientSession) {
  const subLocation = await OfficeSubLocationModel.findById(subLocationId).session(session || null);
  if (!subLocation) throw createHttpError(404, 'Section not found');
  return subLocation;
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
  if (candidate === 'STORE') return 'STORE';
  if (candidate === 'EMPLOYEE') return 'EMPLOYEE';
  if (candidate === 'SUB_LOCATION') return 'SUB_LOCATION';
  return 'OFFICE';
}

function officeHolderFilter(holderId: string) {
  return { holder_type: 'OFFICE', holder_id: holderId };
}

function balanceHolderFilter(holderType: HolderType, holderId: string) {
  return { holder_type: holderType, holder_id: holderId };
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
  if (!/^[a-f\d]{24}$/i.test(holderId)) {
    throw createHttpError(400, 'holderId is invalid');
  }

  if (holderType === 'OFFICE') {
    const office = await getLocation(holderId, session);
    return {
      holderType: 'OFFICE',
      holderId: office.id,
      name: String(office.name || 'Location'),
      officeId: office.id,
      office,
    };
  }

  if (holderType === 'EMPLOYEE') {
    const employee = await getEmployee(holderId, session);
    const officeId = employee.location_id ? String(employee.location_id) : '';
    if (!officeId) throw createHttpError(400, 'Employee is not assigned to an office');
    const office = await getLocation(officeId, session);
    return {
      holderType: 'EMPLOYEE',
      holderId: employee.id,
      name: `Employee: ${String(employee.first_name || '')} ${String(employee.last_name || '')}`.trim(),
      officeId,
      office,
      employee,
    };
  }

  const subLocation = await getSubLocation(holderId, session);
  const officeId = subLocation.office_id ? String(subLocation.office_id) : '';
  if (!officeId) throw createHttpError(400, 'Section is not linked to an office');
  const office = await getLocation(officeId, session);
  return {
    holderType: 'SUB_LOCATION',
    holderId: subLocation.id,
    name: `Section: ${String(subLocation.name || 'Unknown')}`,
    officeId,
    office,
    subLocation,
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
  return {
    $or: [
      { from_holder_type: holderType, from_holder_id: holderId },
      { to_holder_type: holderType, to_holder_id: holderId },
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

async function resolveCurrentEmployeeForUser(userId: string, session?: ClientSession) {
  const employee = await EmployeeModel.findOne({ user_id: userId, is_active: { $ne: false } })
    .sort({ created_at: -1 })
    .session(session || null);
  if (!employee) {
    return null;
  }
  return employee;
}

async function resolveOfficeScopedHolderIds(locationId: string, session?: ClientSession) {
  const [subLocations, employees] = await Promise.all([
    OfficeSubLocationModel.find({ office_id: locationId, is_active: { $ne: false } }, { _id: 1 })
      .session(session || null)
      .lean(),
    EmployeeModel.find({ location_id: locationId, is_active: { $ne: false } }, { _id: 1 })
      .session(session || null)
      .lean(),
  ]);

  return {
    officeId: locationId,
    subLocationIds: subLocations.map((row) => String(row._id)),
    employeeIds: employees.map((row) => String(row._id)),
  };
}

function buildOfficeScopedBalanceFilter(scope: { officeId: string; subLocationIds: string[]; employeeIds: string[] }) {
  const filters: any[] = [{ holder_type: 'OFFICE', holder_id: scope.officeId }];
  if (scope.subLocationIds.length) {
    filters.push({ holder_type: 'SUB_LOCATION', holder_id: { $in: scope.subLocationIds } });
  }
  if (scope.employeeIds.length) {
    filters.push({ holder_type: 'EMPLOYEE', holder_id: { $in: scope.employeeIds } });
  }
  return { $or: filters };
}

function buildOfficeScopedLedgerFilter(scope: { officeId: string; subLocationIds: string[]; employeeIds: string[] }) {
  const filters: any[] = [
    { from_holder_type: 'OFFICE', from_holder_id: scope.officeId },
    { to_holder_type: 'OFFICE', to_holder_id: scope.officeId },
  ];
  if (scope.subLocationIds.length) {
    filters.push({ from_holder_type: 'SUB_LOCATION', from_holder_id: { $in: scope.subLocationIds } });
    filters.push({ to_holder_type: 'SUB_LOCATION', to_holder_id: { $in: scope.subLocationIds } });
  }
  if (scope.employeeIds.length) {
    filters.push({ from_holder_type: 'EMPLOYEE', from_holder_id: { $in: scope.employeeIds } });
    filters.push({ to_holder_type: 'EMPLOYEE', to_holder_id: { $in: scope.employeeIds } });
  }
  return { $or: filters };
}

function isHolderInOfficeScope(
  holderType: HolderType,
  holderId: string,
  scope: { officeId: string; subLocationIds: string[]; employeeIds: string[] }
) {
  if (holderType === 'STORE') return false;
  if (holderType === 'OFFICE') return holderId === scope.officeId;
  if (holderType === 'SUB_LOCATION') return scope.subLocationIds.includes(holderId);
  if (holderType === 'EMPLOYEE') return scope.employeeIds.includes(holderId);
  return false;
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
  if (holder.holderType === 'STORE') return;
  const officeId = resolveHolderOfficeId(holder);
  if (!officeId) {
    throw createHttpError(400, 'Holder office is missing');
  }
  await ensureLocationAccess(user, officeId, session);
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

function buildHandoverAttachmentPayload(file?: { originalname: string; mimetype: string; size: number; path: string } | null) {
  if (!file) {
    return {
      handover_file_name: null,
      handover_mime_type: null,
      handover_size_bytes: null,
      handover_path: null,
    };
  }

  const relativePath = path.join('uploads', 'documents', path.basename(file.path)).replace(/\\/g, '/');
  return {
    handover_file_name: file.originalname,
    handover_mime_type: file.mimetype,
    handover_size_bytes: file.size,
    handover_path: relativePath,
  };
}

async function ensureReceiveCategory(item: any, categoryId: string, session: ClientSession) {
  if (!categoryId) throw createHttpError(400, 'categoryId is required');
  const category = await CategoryModel.findById(categoryId, { asset_type: 1 }).session(session);
  if (!category) throw createHttpError(400, 'Selected category does not exist');
  const categoryAssetType = String(category.asset_type || 'ASSET').toUpperCase();
  if (categoryAssetType !== 'CONSUMABLE') {
    throw createHttpError(400, 'Selected category is not valid for consumables');
  }
  const itemCategoryId = item.category_id ? String(item.category_id) : '';
  if (!itemCategoryId || itemCategoryId !== categoryId) {
    throw createHttpError(400, 'Selected item does not belong to the selected category');
  }
}

async function resolveReceiveSource(
  lotPayload: any,
  session: ClientSession
): Promise<{ sourceType: 'procurement' | 'project'; vendorId: string | null; projectId: string | null; schemeId: string | null }> {
  const sourceType = String(lotPayload?.source || '').trim().toLowerCase();
  if (sourceType !== 'procurement' && sourceType !== 'project') {
    throw createHttpError(400, 'Lot source must be procurement or project');
  }

  if (sourceType === 'procurement') {
    const vendorId = String(lotPayload?.vendorId || '').trim();
    if (!vendorId) throw createHttpError(400, 'vendorId is required for procurement source');
    const vendor = await VendorModel.findById(vendorId).session(session);
    if (!vendor) throw createHttpError(400, 'Selected vendor does not exist');
    return {
      sourceType: 'procurement',
      vendorId: vendor.id,
      projectId: null,
      schemeId: null,
    };
  }

  const projectId = String(lotPayload?.projectId || '').trim();
  const schemeId = String(lotPayload?.schemeId || '').trim();
  if (!projectId) throw createHttpError(400, 'projectId is required for project source');
  if (!schemeId) throw createHttpError(400, 'schemeId is required for project source');

  const [project, scheme] = await Promise.all([
    ProjectModel.findById(projectId).session(session),
    SchemeModel.findById(schemeId).session(session),
  ]);
  if (!project) throw createHttpError(400, 'Selected project does not exist');
  if (!scheme) throw createHttpError(400, 'Selected scheme does not exist');
  if (String(scheme.project_id || '') !== project.id) {
    throw createHttpError(400, 'Selected scheme does not belong to selected project');
  }

  return {
    sourceType: 'project',
    vendorId: null,
    projectId: project.id,
    schemeId: scheme.id,
  };
}

export const inventoryService = {
  async receive(user: AuthUser, payload: any, handoverDocumentation?: { originalname: string; mimetype: string; size: number; path: string }) {
    const session = await mongoose.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const permissions = resolveConsumablePermissions(user.role);
        ensureAllowed(permissions.canReceiveCentral, 'Not permitted to receive into Central Store');

        const item = await getItem(payload.itemId, session);
        const categoryId = String(payload.categoryId || '').trim();
        await ensureReceiveCategory(item, categoryId, session);
        const storeHolder = await getCentralStoreHolder(session);
        const unitLookup = await getUnitLookup({ session });
        ensureChemicalsHolder(item, storeHolder, 'Receiving holder');

        const qtyBase = convertToBaseQty(payload.qty, payload.uom, item.base_uom, unitLookup);
        if (qtyBase <= 0) throw createHttpError(400, 'Quantity must be greater than zero');

        let lotId: string | null = payload.lotId || null;
        if (lotId) {
          if (handoverDocumentation) {
            throw createHttpError(400, 'Handover documentation is only accepted when creating a new lot');
          }
          await ensureLotMatchesItem(lotId, item.id, session);
        } else if (item.requires_lot_tracking !== false) {
          if (!payload.lot) throw createHttpError(400, 'Lot details are required for this item');
          if (!payload.lot.expiryDate) throw createHttpError(400, 'Lot expiry date is required');
          const expiryDate = new Date(payload.lot.expiryDate);
          if (Number.isNaN(expiryDate.getTime())) {
            throw createHttpError(400, 'Lot expiry date is invalid');
          }
          const sourceMeta = await resolveReceiveSource(payload.lot, session);
          const attachment = buildHandoverAttachmentPayload(handoverDocumentation || null);
          const receivedQty = roundQty(qtyBase);
          const newLot = await ConsumableLotModel.create(
            [
              {
                consumable_id: item.id,
                holder_type: storeHolder.holderType,
                holder_id: storeHolder.holderId,
                batch_no: payload.lot.lotNumber,
                source_type: sourceMeta.sourceType,
                vendor_id: sourceMeta.vendorId,
                project_id: sourceMeta.projectId,
                scheme_id: sourceMeta.schemeId,
                received_at: new Date(payload.lot.receivedDate || nowIso()),
                expiry_date: expiryDate,
                qty_received: receivedQty,
                qty_available: receivedQty,
                received_by_user_id: user.userId,
                notes: payload.notes || null,
                ...attachment,
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
        if (handoverDocumentation && !lotId) {
          throw createHttpError(400, 'Handover documentation requires lot-tracked receiving');
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
        if (
          payload.containerId &&
          (fromHolder.holderType === 'EMPLOYEE' ||
            fromHolder.holderType === 'SUB_LOCATION' ||
            toHolder.holderType === 'EMPLOYEE' ||
            toHolder.holderType === 'SUB_LOCATION')
        ) {
          throw createHttpError(400, 'Container movements are only supported between Office/Store holders');
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
        if (user.role === 'employee' && holder.holderType === 'EMPLOYEE') {
          const selfEmployee = await resolveCurrentEmployeeForUser(user.userId, session);
          if (!selfEmployee || String(selfEmployee._id) !== holder.holderId) {
            throw createHttpError(403, 'Employees can only consume from their own holder');
          }
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
        if (payload.containerId && (holder.holderType === 'EMPLOYEE' || holder.holderType === 'SUB_LOCATION')) {
          throw createHttpError(400, 'Container consumption is only supported for Office/Store holders');
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
              locationId: resolveHolderOfficeId(holder),
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
            locationId: resolveHolderOfficeId(holder),
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
            locationId: resolveHolderOfficeId(holder),
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
        if (payload.containerId && (holder.holderType === 'EMPLOYEE' || holder.holderType === 'SUB_LOCATION')) {
          throw createHttpError(400, 'Container disposal is only supported for Office/Store holders');
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
            locationId: resolveHolderOfficeId(holder),
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
    const allowedLocationId = await resolveAccessibleLocationId(user.userId, user.role);
    if (allowedLocationId) {
      const scope = await resolveOfficeScopedHolderIds(allowedLocationId);
      if (holderArgs.holderType === 'STORE') {
        throw createHttpError(403, 'User does not have access to this store');
      }
      if (!isHolderInOfficeScope(holderArgs.holderType, holderArgs.holderId, scope)) {
        throw createHttpError(403, 'User does not have access to this holder');
      }
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
      const scope = await resolveOfficeScopedHolderIds(allowedLocationId);
      if (query.holderId) {
        const requestedType = normalizeHolderType(query.holderType || 'OFFICE');
        if (requestedType === 'STORE') {
          throw createHttpError(403, 'User does not have access to this store');
        }
        if (!isHolderInOfficeScope(requestedType, String(query.holderId), scope)) {
          throw createHttpError(403, 'User does not have access to this holder');
        }
      }
      filter = withAnd(filter, buildOfficeScopedBalanceFilter(scope));
    }

    const limit = clampInt(query.limit, 500, 2000);
    const page = clampInt(query.page, 1, 10_000);

    if (query.lotId) {
      // Explicit lot filter => return lot-level rows for detailed traceability.
      return ConsumableInventoryBalanceModel.find(filter)
        .sort({ updated_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
    }

    // Default behavior => unified inventory view by holder + item, still traceable via lot_count and ledger/lot filters.
    const lotLevelRows = await ConsumableInventoryBalanceModel.find(filter).sort({ updated_at: -1 });
    const grouped = new Map<
      string,
      {
        id: string;
        holder_type: HolderType | null;
        holder_id: string | null;
        consumable_item_id: string;
        lot_id: null;
        qty_on_hand_base: number;
        qty_reserved_base: number;
        created_at: Date | string;
        updated_at: Date | string;
        lot_count: number;
      }
    >();
    const lotCountMap = new Map<string, Set<string>>();

    for (const row of lotLevelRows) {
      const holderType = (row.holder_type || 'OFFICE') as HolderType;
      const holderId = row.holder_id ? String(row.holder_id) : null;
      const itemId = String(row.consumable_item_id);
      if (!holderId || !itemId) continue;

      const key = `${holderType}:${holderId}:${itemId}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          id: key,
          holder_type: holderType,
          holder_id: holderId,
          consumable_item_id: itemId,
          lot_id: null,
          qty_on_hand_base: roundQty(Number(row.qty_on_hand_base || 0)),
          qty_reserved_base: roundQty(Number(row.qty_reserved_base || 0)),
          created_at: row.created_at,
          updated_at: row.updated_at,
          lot_count: 0,
        });
      } else {
        existing.qty_on_hand_base = roundQty(existing.qty_on_hand_base + Number(row.qty_on_hand_base || 0));
        existing.qty_reserved_base = roundQty(existing.qty_reserved_base + Number(row.qty_reserved_base || 0));
        if (new Date(row.updated_at || 0).getTime() > new Date(existing.updated_at || 0).getTime()) {
          existing.updated_at = row.updated_at;
        }
        if (new Date(row.created_at || 0).getTime() < new Date(existing.created_at || 0).getTime()) {
          existing.created_at = row.created_at;
        }
      }

      if (row.lot_id) {
        const set = lotCountMap.get(key) || new Set<string>();
        set.add(String(row.lot_id));
        lotCountMap.set(key, set);
      }
    }

    const unifiedRows = Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        lot_count: lotCountMap.get(entry.id)?.size || 0,
      }))
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());

    const start = (page - 1) * limit;
    return unifiedRows.slice(start, start + limit);
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
      const scope = await resolveOfficeScopedHolderIds(allowedLocationId);
      if (query.holderId) {
        const requestedType = normalizeHolderType(query.holderType || 'OFFICE');
        if (requestedType === 'STORE') {
          throw createHttpError(403, 'User does not have access to this store');
        }
        if (!isHolderInOfficeScope(requestedType, String(query.holderId), scope)) {
          throw createHttpError(403, 'User does not have access to this holder');
        }
      }
      match = withAnd(match, buildOfficeScopedBalanceFilter(scope));
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
      const holderType = ['STORE', 'EMPLOYEE', 'SUB_LOCATION'].includes(String(row._id.holderType))
        ? row._id.holderType
        : 'OFFICE';
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
      const scope = await resolveOfficeScopedHolderIds(allowedLocationId);
      if (query.holderId) {
        const requestedType = normalizeHolderType(query.holderType || 'OFFICE');
        if (requestedType === 'STORE') {
          throw createHttpError(403, 'User does not have access to this store');
        }
        if (!isHolderInOfficeScope(requestedType, String(query.holderId), scope)) {
          throw createHttpError(403, 'User does not have access to this holder');
        }
      }
      filter = withAnd(filter, buildOfficeScopedLedgerFilter(scope));
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
      const scope = await resolveOfficeScopedHolderIds(allowedLocationId);
      if (query.holderId) {
        const requestedType = normalizeHolderType(query.holderType || 'OFFICE');
        if (requestedType === 'STORE') {
          throw createHttpError(403, 'User does not have access to this store');
        }
        if (!isHolderInOfficeScope(requestedType, String(query.holderId), scope)) {
          throw createHttpError(403, 'User does not have access to this holder');
        }
      }
      balanceFilter = withAnd(balanceFilter, buildOfficeScopedBalanceFilter(scope));
    }

    const balanceLimit = clampInt(query.limit, 1000, 5000);
    const balances = await ConsumableInventoryBalanceModel.find(balanceFilter).limit(balanceLimit);
    const lotIds = balances
      .map((balance) => balance.lot_id?.toString())
      .filter((id): id is string => Boolean(id));

    const subLocationIds = balances
      .filter((balance) => balance.holder_type === 'SUB_LOCATION' && balance.holder_id)
      .map((balance) => String(balance.holder_id));
    const employeeIds = balances
      .filter((balance) => balance.holder_type === 'EMPLOYEE' && balance.holder_id)
      .map((balance) => String(balance.holder_id));

    const [lots, subLocations, employees] = await Promise.all([
      ConsumableLotModel.find({ _id: { $in: lotIds } }),
      subLocationIds.length
        ? OfficeSubLocationModel.find({ _id: { $in: subLocationIds } }, { _id: 1, office_id: 1 }).lean()
        : Promise.resolve([]),
      employeeIds.length
        ? EmployeeModel.find({ _id: { $in: employeeIds } }, { _id: 1, location_id: 1 }).lean()
        : Promise.resolve([]),
    ]);
    const lotMap = new Map(lots.map((lot) => [lot.id.toString(), lot]));
    const subLocationOfficeMap = new Map(
      subLocations.map((row: any) => [String(row._id), row.office_id ? String(row.office_id) : null])
    );
    const employeeOfficeMap = new Map(
      employees.map((row: any) => [String(row._id), row.location_id ? String(row.location_id) : null])
    );

    const expiring: any[] = [];
    for (const balance of balances) {
      if (!balance.lot_id) continue;
      const lot = lotMap.get(balance.lot_id.toString());
      if (!lot?.expiry_date) continue;
      const expiryDate = new Date(lot.expiry_date);
      if (expiryDate <= cutoff) {
        const holderType = balance.holder_type || null;
        const holderId = balance.holder_id || null;
        const locationId =
          holderType === 'OFFICE'
            ? holderId
            : holderType === 'SUB_LOCATION' && holderId
              ? subLocationOfficeMap.get(String(holderId)) || null
              : holderType === 'EMPLOYEE' && holderId
                ? employeeOfficeMap.get(String(holderId)) || null
                : null;
        expiring.push({
          lotId: lot.id,
          itemId: String(lot.consumable_id),
          holderType,
          holderId,
          locationId,
          expiryDate: lot.expiry_date,
          qtyOnHandBase: balance.qty_on_hand_base,
        });
      }
    }

    return expiring.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  },
};


