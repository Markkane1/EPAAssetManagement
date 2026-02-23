import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { resolveAccessContext } from '../utils/accessControl';
import { officeAssetItemFilter } from '../utils/assetHolder';
import mongoose from 'mongoose';
import { AssetModel } from '../models/asset.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssignmentModel } from '../models/assignment.model';
import { PurchaseOrderModel } from '../models/purchaseOrder.model';
import { CategoryModel } from '../models/category.model';
import { EmployeeModel } from '../models/employee.model';
import { ConsumableModel } from '../models/consumable.model';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';

type ActivityEntry = {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  user?: string;
};

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

async function getStatsInternal(access: { isOrgAdmin: boolean; officeId: string | null }) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const assetMatch: Record<string, any> = { is_active: { $ne: false } };
  const getOfficeAssetItems = async () => {
    if (access.isOrgAdmin) return null;
    if (!access.officeId) return [];
    return AssetItemModel.distinct('_id', { ...officeAssetItemFilter(access.officeId), is_active: { $ne: false } });
  };

  const officeAssetItemIds = await getOfficeAssetItems();
  const assetItemMatch: Record<string, any> = { is_active: { $ne: false } };
  if (officeAssetItemIds !== null) {
    if (officeAssetItemIds.length === 0) {
      // Force 0 results if they have no office or no items
      assetItemMatch._id = new mongoose.Types.ObjectId();
    } else {
      assetItemMatch._id = { $in: officeAssetItemIds };
    }

    const distinctAssetIds = await AssetItemModel.distinct('asset_id', assetItemMatch);
    if (distinctAssetIds.length > 0) {
      assetMatch._id = { $in: distinctAssetIds };
    } else {
      // Force 0 results
      assetMatch._id = new mongoose.Types.ObjectId();
    }
  }

  const assignmentMatch: Record<string, any> = {
    assigned_date: { $gte: sevenDaysAgo },
    is_active: { $ne: false },
  };
  if (officeAssetItemIds !== null && officeAssetItemIds.length > 0) {
    assignmentMatch.asset_item_id = { $in: officeAssetItemIds };
  } else if (officeAssetItemIds !== null && officeAssetItemIds.length === 0) {
    assignmentMatch._id = new mongoose.Types.ObjectId(); // force 0
  }

  const consumableMatch: Record<string, any> = {
    is_active: true,
    total_quantity: { $gt: 0 },
  };
  if (!access.isOrgAdmin) {
    if (!access.officeId) {
      consumableMatch._id = new mongoose.Types.ObjectId(); // block
    } else {
      // We look for balances the office has
      // actually this is tricky without joining balances
      // For now skip consumable alerts for non-admins if complex, or simplify it
      // TODO: implement properly later
    }
  }

  const [
    totalAssets,
    itemStatusBuckets,
    totalValueAgg,
    recentAssignments,
    pendingPurchaseOrders,
    lowStockAgg,
  ] = await Promise.all([
    AssetModel.countDocuments(assetMatch),
    AssetItemModel.aggregate<{ _id: string; count: number }>([
      { $match: assetItemMatch },
      {
        $group: {
          _id: { $ifNull: ['$item_status', 'Unknown'] },
          count: { $sum: 1 },
        },
      },
    ]),
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
    AssignmentModel.countDocuments(assignmentMatch),
    // Purchase orders only meant for admin or procurement, keep as is for now
    PurchaseOrderModel.countDocuments({
      status: { $in: ['Draft', 'Pending'] },
    }),
    ConsumableModel.aggregate<{ count: number }>([
      {
        $match: consumableMatch, // Incomplete but prevents full exposure if restricted
      },
      {
        $match: {
          $expr: {
            $lte: [{ $ifNull: ['$available_quantity', 0] }, { $multiply: [{ $ifNull: ['$total_quantity', 0] }, 0.2] }],
          },
        },
      },
      { $count: 'count' },
    ]),
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
    lowStockAlerts: lowStockAgg[0]?.count || 0,
  };
}

async function getAssetsByCategoryInternal(access: { isOrgAdmin: boolean; officeId: string | null }) {
  const assetMatch: Record<string, any> = { is_active: { $ne: false } };

  if (!access.isOrgAdmin) {
    if (!access.officeId) {
      assetMatch._id = new mongoose.Types.ObjectId(); // empty results
    } else {
      const officeAssetItemIds = await AssetItemModel.distinct('_id', { ...officeAssetItemFilter(access.officeId), is_active: { $ne: false } });
      if (officeAssetItemIds.length === 0) {
        assetMatch._id = new mongoose.Types.ObjectId();
      } else {
        const distinctAssetIds = await AssetItemModel.distinct('asset_id', { _id: { $in: officeAssetItemIds } });
        if (distinctAssetIds.length > 0) {
          assetMatch._id = { $in: distinctAssetIds };
        } else {
          assetMatch._id = new mongoose.Types.ObjectId();
        }
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

async function getRecentActivityInternal(limit: number) {
  const safeLimit = clampLimit(limit, 10, 100);
  const activities: ActivityEntry[] = [];

  const [assignmentsRaw, maintenanceRecordsRaw, newAssetsRaw] = await Promise.all([
    AssignmentModel.find({}, { employee_id: 1, assigned_date: 1, created_at: 1 })
      .sort({ created_at: -1 })
      .limit(safeLimit)
      .lean(),
    MaintenanceRecordModel.find({}, { description: 1, created_at: 1, scheduled_date: 1, performed_by: 1 })
      .sort({ created_at: -1 })
      .limit(safeLimit)
      .lean(),
    AssetModel.find({}, { name: 1, created_at: 1, acquisition_date: 1 })
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
      const limit = clampLimit(req.query.limit, 10, 100);
      res.json(await getRecentActivityInternal(limit)); // Can also scope this down later
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
        getRecentActivityInternal(10), // Optional: scope recent activity too
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
  getStatsInternal,
  getAssetsByCategoryInternal,
  getAssetsByStatusInternal,
  getRecentActivityInternal,
};
