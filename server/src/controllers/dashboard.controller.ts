import { Request, Response, NextFunction } from 'express';
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

async function getStatsInternal() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    totalAssets,
    itemStatusBuckets,
    totalValueAgg,
    recentAssignments,
    pendingPurchaseOrders,
    lowStockAgg,
  ] = await Promise.all([
    AssetModel.countDocuments(),
    AssetItemModel.aggregate<{ _id: string; count: number }>([
      {
        $group: {
          _id: { $ifNull: ['$item_status', 'Unknown'] },
          count: { $sum: 1 },
        },
      },
    ]),
    AssetModel.aggregate<{ totalValue: number }>([
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
    AssignmentModel.countDocuments({
      assigned_date: { $gte: sevenDaysAgo },
    }),
    PurchaseOrderModel.countDocuments({
      status: { $in: ['Draft', 'Pending'] },
    }),
    ConsumableModel.aggregate<{ count: number }>([
      {
        $match: {
          is_active: true,
          total_quantity: { $gt: 0 },
        },
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

async function getAssetsByCategoryInternal() {
  const [categoryBuckets, categories] = await Promise.all([
    AssetModel.aggregate<{ _id: string | null; count: number }>([
      {
        $group: {
          _id: '$category_id',
          count: { $sum: { $ifNull: ['$quantity', 1] } },
        },
      },
    ]),
    CategoryModel.find({}, { name: 1 }).lean(),
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

async function getAssetsByStatusInternal() {
  const statusBuckets = await AssetItemModel.aggregate<{ _id: string; count: number }>([
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
  getStats: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await getStatsInternal());
    } catch (error) {
      next(error);
    }
  },
  getAssetsByCategory: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await getAssetsByCategoryInternal());
    } catch (error) {
      next(error);
    }
  },
  getAssetsByStatus: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await getAssetsByStatusInternal());
    } catch (error) {
      next(error);
    }
  },
  getRecentActivity: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = clampLimit(req.query.limit, 10, 100);
      res.json(await getRecentActivityInternal(limit));
    } catch (error) {
      next(error);
    }
  },
  getDashboardData: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [stats, assetsByCategory, assetsByStatus, recentActivity] = await Promise.all([
        getStatsInternal(),
        getAssetsByCategoryInternal(),
        getAssetsByStatusInternal(),
        getRecentActivityInternal(10),
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
