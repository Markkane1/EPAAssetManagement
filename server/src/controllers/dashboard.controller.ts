import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext, type AccessContext } from '../utils/accessControl';
import { officeAssetItemFilter } from '../utils/assetHolder';
import mongoose from 'mongoose';
import { AssetModel } from '../models/asset.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssignmentModel } from '../models/assignment.model';
import { PurchaseOrderModel } from '../models/purchaseOrder.model';
import { CategoryModel } from '../models/category.model';
import { EmployeeModel } from '../models/employee.model';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';
import { OfficeModel } from '../models/office.model';
import { RequisitionModel } from '../models/requisition.model';
import { ReturnRequestModel } from '../models/returnRequest.model';
import { ConsumableItemModel } from '../modules/consumables/models/consumableItem.model';
import { ConsumableInventoryBalanceModel } from '../modules/consumables/models/consumableInventoryBalance.model';
import { createBulkNotifications, resolveNotificationRecipientsByOfficeMap } from '../services/notification.service';
import { escapeRegex } from '../utils/requestParsing';

type ActivityEntry = {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  user?: string;
};

const EMPLOYEE_OPEN_REQUISITION_STATUSES = [
  'SUBMITTED',
  'PENDING_VERIFICATION',
  'APPROVED',
  'VERIFIED_APPROVED',
  'IN_FULFILLMENT',
  'PARTIALLY_FULFILLED',
] as const;

const EMPLOYEE_OPEN_RETURN_STATUSES = ['SUBMITTED', 'RECEIVED_CONFIRMED'] as const;

function clampLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function asTimestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

async function resolveRequesterEmployee(user?: AuthRequest['user']) {
  const userId = String(user?.userId || '').trim();
  const requesterEmail = String(user?.email || '').trim();

  if (userId) {
    const byUserId: any = await EmployeeModel.findOne(
      { user_id: userId, is_active: { $ne: false } },
      { _id: 1, first_name: 1, last_name: 1, email: 1 }
    )
      .lean()
      .exec();
    if (byUserId?._id) return byUserId;
  }

  if (!requesterEmail) return null;
  const byEmail: any = await EmployeeModel.findOne(
    {
      email: { $regex: `^${escapeRegex(requesterEmail)}$`, $options: 'i' },
      is_active: { $ne: false },
    },
    { _id: 1, first_name: 1, last_name: 1, email: 1 }
  )
    .lean()
    .exec();
  return byEmail || null;
}

async function buildOfficeRecipientMap(officeIds: string[]) {
  return resolveNotificationRecipientsByOfficeMap({
    officeIds,
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
  });
}

async function getOfficeScopedAssetReferences(officeId: string) {
  const [summary] = await AssetItemModel.aggregate<{
    assetIds: Array<{ _id: mongoose.Types.ObjectId }>;
    assetItemIds: Array<{ _id: mongoose.Types.ObjectId }>;
  }>([
    {
      $match: {
        ...officeAssetItemFilter(officeId),
        is_active: { $ne: false },
      },
    },
    {
      $facet: {
        assetIds: [{ $group: { _id: '$asset_id' } }],
        assetItemIds: [{ $group: { _id: '$_id' } }],
      },
    },
  ]);

  return {
    assetIds: (summary?.assetIds || []).map((row) => row._id),
    assetItemIds: (summary?.assetItemIds || []).map((row) => row._id),
  };
}

async function getLowStockAlertCount(access: AccessContext) {
  if (!access.isOrgAdmin && !access.officeId) return 0;

  const match: Record<string, unknown> = {
    holder_type: 'OFFICE',
  };
  if (!access.isOrgAdmin) {
    match.holder_id = access.officeId;
  }

  const lowStockBalances = await ConsumableInventoryBalanceModel.aggregate<{
    _id: { officeId: string; itemId: string };
    qtyOnHandBase: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: { officeId: '$holder_id', itemId: '$consumable_item_id' },
        qtyOnHandBase: { $sum: '$qty_on_hand_base' },
      },
    },
  ]);
  if (lowStockBalances.length === 0) return 0;

  const itemIds = Array.from(
    new Set(lowStockBalances.map((row) => String(row._id.itemId || '')).filter(Boolean))
  );
  if (itemIds.length === 0) return 0;

  const items = await ConsumableItemModel.find(
    { _id: { $in: itemIds }, is_active: { $ne: false } },
    { _id: 1, default_min_stock: 1, default_reorder_point: 1 }
  )
    .lean()
    .exec();

  const thresholdByItemId = new Map(
    items.map((item: any) => {
      const thresholdValue = Number(item.default_min_stock ?? item.default_reorder_point);
      return [
        String(item._id),
        Number.isFinite(thresholdValue) && thresholdValue > 0 ? thresholdValue : null,
      ];
    })
  );

  return lowStockBalances.reduce((count, row) => {
    const threshold = thresholdByItemId.get(String(row._id.itemId || ''));
    if (threshold == null) return count;
    return Number(row.qtyOnHandBase || 0) <= threshold ? count + 1 : count;
  }, 0);
}

async function dispatchLowStockNotifications() {
  const lowStockBalances = await ConsumableInventoryBalanceModel.aggregate<{
    _id: { officeId: string; itemId: string };
    qtyOnHandBase: number;
  }>([
    { $match: { holder_type: 'OFFICE' } },
    {
      $group: {
        _id: { officeId: '$holder_id', itemId: '$consumable_item_id' },
        qtyOnHandBase: { $sum: '$qty_on_hand_base' },
      },
    },
  ]);
  if (lowStockBalances.length === 0) return;

  const itemIds = Array.from(
    new Set(lowStockBalances.map((row) => String(row._id.itemId || '')).filter(Boolean))
  );
  if (itemIds.length === 0) return;

  const items = await ConsumableItemModel.find(
    { _id: { $in: itemIds }, is_active: { $ne: false } },
    { _id: 1, name: 1, default_min_stock: 1, default_reorder_point: 1 }
  )
    .lean()
    .exec();
  const itemById = new Map(
    items.map((item: any) => [
      String(item._id),
      {
        name: String(item.name || 'Consumable item'),
        threshold:
          Number(item.default_min_stock ?? item.default_reorder_point) > 0
            ? Number(item.default_min_stock ?? item.default_reorder_point)
            : null,
      },
    ])
  );

  const alertRows = lowStockBalances
    .map((row) => {
      const officeId = String(row._id.officeId || '');
      const itemId = String(row._id.itemId || '');
      const item = itemById.get(itemId);
      if (!officeId || !item || item.threshold == null) return null;
      const qtyOnHandBase = Number(row.qtyOnHandBase || 0);
      if (qtyOnHandBase > item.threshold) return null;
      return {
        officeId,
        itemId,
        itemName: item.name,
        qtyOnHandBase,
        threshold: item.threshold,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (alertRows.length === 0) return;

  const officeIds = Array.from(new Set(alertRows.map((row) => row.officeId)));
  const recipientsByOffice = await buildOfficeRecipientMap(officeIds);

  const payload = alertRows.flatMap((row) => {
    const recipients = recipientsByOffice.get(row.officeId) || [];
    return recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId: row.officeId,
      type: 'LOW_STOCK_ALERT',
      title: 'Low Stock Alert',
      message: `${row.itemName} is low (${row.qtyOnHandBase} remaining, threshold ${row.threshold}).`,
      entityType: 'ConsumableItem',
      entityId: row.itemId,
      dedupeWindowHours: 24,
    }));
  });
  if (payload.length === 0) return;
  await createBulkNotifications(payload);
}

async function dispatchWarrantyNotifications() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const items = await AssetItemModel.find(
    {
      is_active: { $ne: false },
      holder_type: 'OFFICE',
      holder_id: { $ne: null },
      warranty_expiry: { $ne: null, $lte: cutoff },
    },
    { _id: 1, holder_id: 1, warranty_expiry: 1, tag: 1 }
  )
    .sort({ warranty_expiry: 1 })
    .limit(500)
    .lean()
    .exec();

  if (items.length === 0) return;

  const officeIds = Array.from(new Set(items.map((item: any) => String(item.holder_id || '')).filter(Boolean)));
  if (officeIds.length === 0) return;
  const recipientsByOffice = await buildOfficeRecipientMap(officeIds);

  const now = Date.now();
  const payload = items.flatMap((item: any) => {
    const officeId = String(item.holder_id || '');
    const recipients = recipientsByOffice.get(officeId) || [];
    if (!officeId || recipients.length === 0) return [];

    const expiry = new Date(String(item.warranty_expiry));
    if (Number.isNaN(expiry.getTime())) return [];
    const days = Math.ceil((expiry.getTime() - now) / (24 * 60 * 60 * 1000));
    const tag = item.tag ? String(item.tag) : 'Asset item';
    const message =
      days < 0
        ? `${tag} warranty expired on ${expiry.toLocaleDateString()}.`
        : days === 0
          ? `${tag} warranty expires today.`
          : `${tag} warranty expires in ${days} day(s) on ${expiry.toLocaleDateString()}.`;

    return recipients.map((recipientUserId) => ({
      recipientUserId,
      officeId,
      type: 'WARRANTY_EXPIRY_ALERT',
      title: 'Warranty Expiry Alert',
      message,
      entityType: 'AssetItem',
      entityId: String(item._id),
      dedupeWindowHours: 24,
    }));
  });

  if (payload.length === 0) return;
  await createBulkNotifications(payload);
}

async function dispatchThresholdNotifications(access: { isOrgAdmin: boolean; officeId: string | null }) {
  if (!access.isOrgAdmin) return;
  await Promise.all([dispatchLowStockNotifications(), dispatchWarrantyNotifications()]);
}

async function getOfficeScopedAssetOverview(officeId: string) {
  const [summary] = await AssetItemModel.aggregate<{
    assetIds: Array<{ _id: mongoose.Types.ObjectId }>;
    statusBuckets: Array<{ _id: string; count: number }>;
  }>([
    {
      $match: {
        ...officeAssetItemFilter(officeId),
        is_active: { $ne: false },
      },
    },
    {
      $facet: {
        assetIds: [{ $group: { _id: '$asset_id' } }],
        statusBuckets: [
          {
            $group: {
              _id: { $ifNull: ['$item_status', 'Unknown'] },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  return {
    assetIds: (summary?.assetIds || []).map((row) => row._id),
    statusBuckets: summary?.statusBuckets || [],
  };
}

async function countRecentAssignmentsForOffice(officeId: string, assignedAfter: Date) {
  const counts = await AssignmentModel.aggregate<{ count: number }>([
    {
      $match: {
        assigned_date: { $gte: assignedAfter },
        is_active: { $ne: false },
      },
    },
    {
      $lookup: {
        from: AssetItemModel.collection.name,
        localField: 'asset_item_id',
        foreignField: '_id',
        as: 'asset_item',
      },
    },
    {
      $match: {
        asset_item: {
          $elemMatch: {
            ...officeAssetItemFilter(officeId),
            is_active: { $ne: false },
          },
        },
      },
    },
    { $count: 'count' },
  ]);
  return counts[0]?.count || 0;
}

async function getMySummaryInternal(user?: AuthRequest['user']) {
  const requester = await resolveRequesterEmployee(user);
  const employeeId = requester?._id ? String(requester._id) : null;
  const requisitionFilter: Record<string, unknown> = {
    submitted_by_user_id: user?.userId,
    status: { $in: Array.from(EMPLOYEE_OPEN_REQUISITION_STATUSES) },
  };
  if (user?.locationId) {
    requisitionFilter.office_id = user.locationId;
  }

  const returnRequestFilter =
    employeeId
      ? ({
          employee_id: employeeId,
          status: { $in: Array.from(EMPLOYEE_OPEN_RETURN_STATUSES) },
          ...(user?.locationId ? { office_id: user.locationId } : {}),
        } satisfies Record<string, unknown>)
      : null;

  const [openRequisitionsCount, openReturnsCount] = await Promise.all([
    user?.userId ? RequisitionModel.countDocuments(requisitionFilter) : Promise.resolve(0),
    returnRequestFilter ? ReturnRequestModel.countDocuments(returnRequestFilter) : Promise.resolve(0),
  ]);

  return {
    employeeId,
    employee: requester
      ? {
          id: String(requester._id),
          first_name: String(requester.first_name || ''),
          last_name: String(requester.last_name || ''),
          email: String(requester.email || ''),
          directorate_id: requester.directorate_id ? String(requester.directorate_id) : null,
          location_id: requester.location_id ? String(requester.location_id) : null,
        }
      : null,
    openRequisitionsCount,
    openReturnsCount,
  };
}

async function getAdminPanelsInternal(access: AccessContext, searchTermRaw: unknown) {
  const searchTerm = String(searchTermRaw || '').trim();
  const itemScopeMatch: Record<string, unknown> = { is_active: { $ne: false } };
  if (!access.isOrgAdmin) {
    if (!access.officeId) {
      return {
        recentItems: [] as Array<Record<string, unknown>>,
        locations: [] as Array<Record<string, unknown>>,
        storeItemCount: 0,
      };
    }
    Object.assign(itemScopeMatch, officeAssetItemFilter(access.officeId));
  }

  const recentItemMatch: Record<string, unknown> = { ...itemScopeMatch };
  if (searchTerm) {
    const regex = new RegExp(escapeRegex(searchTerm), 'i');
    recentItemMatch.$or = [
      { tag: regex },
      { serial_number: regex },
      { item_status: regex },
      { item_condition: regex },
    ];
  }

  const officeFilter: Record<string, unknown> = {};
  if (searchTerm) {
    const regex = new RegExp(escapeRegex(searchTerm), 'i');
    officeFilter.$or = [{ name: regex }, { address: regex }];
  }

  const [recentItems, offices, itemCounts] = await Promise.all([
    AssetItemModel.find(
      recentItemMatch,
      { _id: 1, tag: 1, serial_number: 1, item_status: 1, item_condition: 1 }
    )
      .sort({ created_at: -1 })
      .limit(5)
      .lean()
      .exec(),
    OfficeModel.find(officeFilter, { _id: 1, name: 1, address: 1 })
      .sort({ created_at: -1 })
      .limit(5)
      .lean()
      .exec(),
    AssetItemModel.aggregate<Array<{ _id: { holderType: string | null; holderId: mongoose.Types.ObjectId | null }; count: number }>>([
      { $match: itemScopeMatch },
      {
        $group: {
          _id: {
            holderType: '$holder_type',
            holderId: '$holder_id',
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const officeCountMap = new Map<string, number>();
  let storeItemCount = 0;
  itemCounts.forEach((row) => {
    const holderType = String(row._id?.holderType || '').toUpperCase();
    const holderId = row._id?.holderId ? String(row._id.holderId) : '';
    if (holderType === 'OFFICE' && holderId) {
      officeCountMap.set(holderId, Number(row.count || 0));
    }
    if (holderType === 'STORE') {
      storeItemCount += Number(row.count || 0);
    }
  });

  return {
    recentItems: recentItems.map((item: any) => ({
      id: String(item._id),
      tag: item.tag ? String(item.tag) : null,
      serial_number: item.serial_number ? String(item.serial_number) : null,
      item_status: item.item_status ? String(item.item_status) : null,
      item_condition: item.item_condition ? String(item.item_condition) : null,
    })),
    locations: offices.map((office: any) => ({
      id: String(office._id),
      name: String(office.name || ''),
      address: office.address ? String(office.address) : null,
      assetCount: officeCountMap.get(String(office._id)) || 0,
    })),
    storeItemCount,
  };
}

async function getStatsInternal(access: AccessContext) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const assetMatch: Record<string, any> = { is_active: { $ne: false } };
  const itemStatusBucketsPromise = access.isOrgAdmin
    ? AssetItemModel.aggregate<{ _id: string; count: number }>([
        { $match: { is_active: { $ne: false } } },
        {
          $group: {
            _id: { $ifNull: ['$item_status', 'Unknown'] },
            count: { $sum: 1 },
          },
        },
      ])
    : access.officeId
      ? getOfficeScopedAssetOverview(access.officeId)
      : Promise.resolve({ assetIds: [], statusBuckets: [] as Array<{ _id: string; count: number }> });

  const recentAssignmentsPromise = access.isOrgAdmin
    ? AssignmentModel.countDocuments({
        assigned_date: { $gte: sevenDaysAgo },
        is_active: { $ne: false },
      })
    : access.officeId
      ? countRecentAssignmentsForOffice(access.officeId, sevenDaysAgo)
      : Promise.resolve(0);

  const [
    officeScopedSummary,
    pendingPurchaseOrders,
    lowStockAlerts,
  ] = await Promise.all([
    itemStatusBucketsPromise,
    // Purchase orders only meant for admin or procurement, keep as is for now
    PurchaseOrderModel.countDocuments({
      status: { $in: ['Draft', 'Pending'] },
    }),
    getLowStockAlertCount(access),
  ]);

  const itemStatusBuckets = Array.isArray(officeScopedSummary)
    ? officeScopedSummary
    : officeScopedSummary.statusBuckets;
  if (!access.isOrgAdmin) {
    if (!access.officeId || officeScopedSummary.assetIds.length === 0) {
      assetMatch._id = new mongoose.Types.ObjectId();
    } else {
      assetMatch._id = { $in: officeScopedSummary.assetIds };
    }
  }

  const [totalAssets, totalValueAgg, recentAssignments] = await Promise.all([
    AssetModel.countDocuments(assetMatch),
    AssetModel.aggregate<{ totalValue: number }>([
      { $match: assetMatch },
      {
        $group: {
          _id: null,
          totalValue: {
            $sum: {
              $multiply: [{ $ifNull: ['$unit_price', 0] }, { $ifNull: ['$quantity', 1] }],
            },
          },
        },
      },
    ]),
    recentAssignmentsPromise,
  ]);

  const statusMap = new Map(itemStatusBuckets.map((bucket) => [bucket._id, bucket.count]));
  const totalAssetItems = itemStatusBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return {
    totalAssets,
    totalAssetItems,
    assignedItems: statusMap.get('Assigned') || 0,
    availableItems: statusMap.get('Available') || 0,
    maintenanceItems: statusMap.get('Maintenance') || 0,
    totalValue: totalValueAgg[0]?.totalValue || 0,
    recentAssignments,
    pendingPurchaseOrders,
    lowStockAlerts,
  };
}

async function getAssetsByCategoryInternal(access: { isOrgAdmin: boolean; officeId: string | null }) {
  const assetMatch: Record<string, any> = { is_active: { $ne: false } };

  if (!access.isOrgAdmin) {
    if (!access.officeId) {
      assetMatch._id = new mongoose.Types.ObjectId(); // empty results
    } else {
      const officeSummary = await getOfficeScopedAssetOverview(access.officeId);
      if (officeSummary.assetIds.length === 0) {
        assetMatch._id = new mongoose.Types.ObjectId();
      } else {
        assetMatch._id = { $in: officeSummary.assetIds };
      }
    }
  }

  const [categoryBuckets, categories] = await Promise.all([
    AssetModel.aggregate<{ _id: string | null; count: number }>([
      { $match: assetMatch },
      {
        $group: {
          _id: '$category_id',
          count: { $sum: { $ifNull: ['$quantity', 1] } },
        },
      },
    ]),
    CategoryModel.find(
      { $or: [{ asset_type: 'ASSET' }, { asset_type: { $exists: false } }] },
      { name: 1 }
    ).lean(),
  ]);

  const categoryMap = new Map(
    categories.map((category) => [category._id.toString(), category.name as string])
  );
  const total = categoryBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return categoryBuckets.map((bucket) => {
    const categoryId = bucket._id ? bucket._id.toString() : 'uncategorized';
    return {
      categoryId,
      categoryName:
        categoryId === 'uncategorized' ? 'Uncategorized' : categoryMap.get(categoryId) || 'Uncategorized',
      count: bucket.count,
      percentage: total > 0 ? Math.round((bucket.count / total) * 100) : 0,
    };
  });
}

async function getAssetsByStatusInternal(access: { isOrgAdmin: boolean; officeId: string | null }) {
  const assetItemMatch: Record<string, any> = { is_active: { $ne: false } };
  if (!access.isOrgAdmin) {
    if (!access.officeId) {
      assetItemMatch._id = new mongoose.Types.ObjectId(); // Force empty
    } else {
      Object.assign(assetItemMatch, officeAssetItemFilter(access.officeId));
    }
  }

  const statusBuckets = await AssetItemModel.aggregate<{ _id: string; count: number }>([
    { $match: assetItemMatch },
    {
      $group: {
        _id: { $ifNull: ['$item_status', 'Unknown'] },
        count: { $sum: 1 },
      },
    },
  ]);

  const total = statusBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return statusBuckets.map((bucket) => ({
    status: bucket._id || 'Unknown',
    count: bucket.count,
    percentage: total > 0 ? Math.round((bucket.count / total) * 100) : 0,
  }));
}

async function getRecentActivityInternal(access: AccessContext, limit: number) {
  const safeLimit = clampLimit(limit, 10, 100);
  const activities: ActivityEntry[] = [];
  const assignmentMatch: Record<string, unknown> = {};
  const maintenanceMatch: Record<string, unknown> = {};
  const assetMatch: Record<string, unknown> = {};

  if (!access.isOrgAdmin) {
    if (!access.officeId) {
      return [];
    }

    const scopedReferences = await getOfficeScopedAssetReferences(access.officeId);
    if (scopedReferences.assetItemIds.length === 0) {
      return [];
    }
    assignmentMatch.asset_item_id = { $in: scopedReferences.assetItemIds };
    maintenanceMatch.asset_item_id = { $in: scopedReferences.assetItemIds };

    if (scopedReferences.assetIds.length === 0) {
      assetMatch._id = new mongoose.Types.ObjectId();
    } else {
      assetMatch._id = { $in: scopedReferences.assetIds };
    }
  }

  const [assignmentsRaw, maintenanceRecordsRaw, newAssetsRaw] = await Promise.all([
    AssignmentModel.find(assignmentMatch, { employee_id: 1, assigned_date: 1, created_at: 1 })
      .sort({ created_at: -1 })
      .limit(safeLimit)
      .lean(),
    MaintenanceRecordModel.find(maintenanceMatch, { description: 1, created_at: 1, scheduled_date: 1, performed_by: 1 })
      .sort({ created_at: -1 })
      .limit(safeLimit)
      .lean(),
    AssetModel.find(assetMatch, { name: 1, created_at: 1, acquisition_date: 1 })
      .sort({ created_at: -1 })
      .limit(safeLimit)
      .lean(),
  ]);
  const assignments = assignmentsRaw as Array<Record<string, unknown>>;
  const maintenanceRecords = maintenanceRecordsRaw as Array<Record<string, unknown>>;
  const newAssets = newAssetsRaw as Array<Record<string, unknown>>;

  const employeeIds = [
    ...new Set(
      assignments
        .map((assignment) => assignment.employee_id?.toString())
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const employees =
    employeeIds.length > 0
      ? await EmployeeModel.find({ _id: { $in: employeeIds } }, { first_name: 1, last_name: 1 }).lean()
      : [];
  const employeeMap = new Map(
    employees.map((employee) => [employee._id.toString(), `${employee.first_name} ${employee.last_name}`.trim()])
  );

  assignments.forEach((assignment) => {
    const assignmentId = assignment._id?.toString() || '';
    const employeeId = assignment.employee_id?.toString();
    const employeeName = employeeId ? employeeMap.get(employeeId) : undefined;
    activities.push({
      id: assignmentId,
      type: 'assignment',
      description: employeeName ? `Asset assigned to ${employeeName}` : 'Asset assigned',
      timestamp: asTimestamp(assignment.assigned_date),
      user: employeeName,
    });
  });

  maintenanceRecords.forEach((record) => {
    activities.push({
      id: record._id?.toString() || '',
      type: 'maintenance',
      description:
        typeof record.description === 'string' && record.description.trim().length > 0
          ? record.description
          : 'Maintenance record updated',
      timestamp: asTimestamp(record.created_at || record.scheduled_date),
      user: typeof record.performed_by === 'string' ? record.performed_by : undefined,
    });
  });

  newAssets.forEach((asset) => {
    activities.push({
      id: asset._id?.toString() || '',
      type: 'new_asset',
      description: `New asset added: ${String(asset.name || 'Unknown')}`,
      timestamp: asTimestamp(asset.created_at || asset.acquisition_date),
    });
  });

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return activities.slice(0, safeLimit);
}

export const dashboardController = {
  getStats: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      res.json(await getStatsInternal(access));
    } catch (error) {
      next(error);
    }
  },
  getAssetsByCategory: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      res.json(await getAssetsByCategoryInternal(access));
    } catch (error) {
      next(error);
    }
  },
  getAssetsByStatus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      res.json(await getAssetsByStatusInternal(access));
    } catch (error) {
      next(error);
    }
  },
  getRecentActivity: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const limit = clampLimit(req.query.limit, 10, 100);
      res.json(await getRecentActivityInternal(access, limit));
    } catch (error) {
      next(error);
    }
  },
  getDashboardData: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      const [stats, assetsByCategory, assetsByStatus, recentActivity] = await Promise.all([
        getStatsInternal(access),
        getAssetsByCategoryInternal(access),
        getAssetsByStatusInternal(access),
        getRecentActivityInternal(access, 10),
      ]);

      res.json({
        stats,
        assetsByCategory,
        assetsByStatus,
        recentActivity,
      });
    } catch (error) {
      next(error);
    }
  },
  getMySummary: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.json(await getMySummaryInternal(req.user));
    } catch (error) {
      next(error);
    }
  },
  getAdminPanels: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await resolveAccessContext(req.user);
      res.json(await getAdminPanelsInternal(access, req.query.search));
    } catch (error) {
      next(error);
    }
  },
  getStatsInternal,
  getAssetsByCategoryInternal,
  getAssetsByStatusInternal,
  getRecentActivityInternal,
  getMySummaryInternal,
  getAdminPanelsInternal,
};
