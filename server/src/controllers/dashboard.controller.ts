import { Request, Response, NextFunction } from 'express';
import { AssetModel } from '../models/asset.model';
import { AssetItemModel } from '../models/assetItem.model';
import { AssignmentModel } from '../models/assignment.model';
import { PurchaseOrderModel } from '../models/purchaseOrder.model';
import { CategoryModel } from '../models/category.model';
import { EmployeeModel } from '../models/employee.model';
import { ConsumableModel } from '../models/consumable.model';
import { MaintenanceRecordModel } from '../models/maintenanceRecord.model';

export const dashboardController = {
  getStats: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const totalAssets = await AssetModel.countDocuments();
      const assetItems = await AssetItemModel.find();
      const totalAssetItems = assetItems.length;
      const assignedItems = assetItems.filter((i) => i.item_status === 'Assigned').length;
      const availableItems = assetItems.filter((i) => i.item_status === 'Available').length;
      const maintenanceItems = assetItems.filter((i) => i.item_status === 'Maintenance').length;

      const assets = await AssetModel.find();
      const totalValue = assets.reduce(
        (sum, asset) => sum + (asset.unit_price || 0) * (asset.quantity || 1),
        0
      );

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentAssignments = await AssignmentModel.countDocuments({
        assigned_date: { $gte: sevenDaysAgo.toISOString().split('T')[0] },
      });

      const pendingPurchaseOrders = await PurchaseOrderModel.countDocuments({
        status: { $in: ['Draft', 'Pending'] },
      });

      const consumables = await ConsumableModel.find({ is_active: true });
      const lowStockAlerts = consumables.filter((item) => {
        const total = item.total_quantity || 0;
        if (total <= 0) return false;
        return (item.available_quantity || 0) <= total * 0.2;
      }).length;

      res.json({
        totalAssets,
        totalAssetItems,
        assignedItems,
        availableItems,
        maintenanceItems,
        totalValue,
        recentAssignments,
        pendingPurchaseOrders,
        lowStockAlerts,
      });
    } catch (error) {
      next(error);
    }
  },
  getAssetsByCategory: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const assets = await AssetModel.find();
      const categories = await CategoryModel.find();
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

      const counts = new Map<string, number>();
      assets.forEach((asset) => {
        const categoryId = asset.category_id ? asset.category_id.toString() : 'uncategorized';
        const current = counts.get(categoryId) || 0;
        counts.set(categoryId, current + (asset.quantity || 1));
      });

      const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
      const result = Array.from(counts.entries()).map(([categoryId, count]) => ({
        categoryId,
        categoryName: categoryId === 'uncategorized' ? 'Uncategorized' : categoryMap.get(categoryId) || 'Uncategorized',
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
  getAssetsByStatus: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const assetItems = await AssetItemModel.find();
      if (!assetItems.length) return res.json([]);

      const counts = new Map<string, number>();
      assetItems.forEach((item) => {
        const status = item.item_status || 'Unknown';
        counts.set(status, (counts.get(status) || 0) + 1);
      });

      const total = assetItems.length;
      const result = Array.from(counts.entries()).map(([status, count]) => ({
        status,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
  getRecentActivity: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit || 10);
      const activities: Array<{ id: string; type: string; description: string; timestamp: string; user?: string }> = [];

      const assignments = await AssignmentModel.find().sort({ created_at: -1 }).limit(limit);
      const maintenanceRecords = await MaintenanceRecordModel.find().sort({ created_at: -1 }).limit(limit);
      const newAssets = await AssetModel.find().sort({ created_at: -1 }).limit(limit);

      const employeeIds = [...new Set(assignments.map((a) => a.employee_id.toString()))];
      const employees = await EmployeeModel.find({ _id: { $in: employeeIds } });
      const employeeMap = new Map(employees.map((e) => [e.id, e]));

      assignments.forEach((assignment) => {
        const employee = employeeMap.get(assignment.employee_id.toString());
        activities.push({
          id: assignment.id,
          type: 'assignment',
          description: employee
            ? `Asset assigned to ${employee.first_name} ${employee.last_name}`
            : 'Asset assigned',
          timestamp: assignment.assigned_date,
          user: employee ? `${employee.first_name} ${employee.last_name}` : undefined,
        });
      });

      maintenanceRecords.forEach((record) => {
        activities.push({
          id: record.id,
          type: 'maintenance',
          description: record.description || 'Maintenance record updated',
          timestamp: record.created_at || record.scheduled_date || new Date().toISOString(),
          user: record.performed_by || undefined,
        });
      });

      newAssets.forEach((asset) => {
        activities.push({
          id: asset.id,
          type: 'new_asset',
          description: `New asset added: ${asset.name}`,
          timestamp: asset.created_at || asset.acquisition_date || new Date().toISOString(),
        });
      });

      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      res.json(activities.slice(0, limit));
    } catch (error) {
      next(error);
    }
  },
  getDashboardData: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await dashboardController.getStatsInternal();
      const assetsByCategory = await dashboardController.getAssetsByCategoryInternal();
      const assetsByStatus = await dashboardController.getAssetsByStatusInternal();
      const recentActivity = await dashboardController.getRecentActivityInternal(10);

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
  getStatsInternal: async () => {
    const totalAssets = await AssetModel.countDocuments();
    const assetItems = await AssetItemModel.find();
    const totalAssetItems = assetItems.length;
    const assignedItems = assetItems.filter((i) => i.item_status === 'Assigned').length;
    const availableItems = assetItems.filter((i) => i.item_status === 'Available').length;
    const maintenanceItems = assetItems.filter((i) => i.item_status === 'Maintenance').length;

    const assets = await AssetModel.find();
    const totalValue = assets.reduce(
      (sum, asset) => sum + (asset.unit_price || 0) * (asset.quantity || 1),
      0
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentAssignments = await AssignmentModel.countDocuments({
      assigned_date: { $gte: sevenDaysAgo.toISOString().split('T')[0] },
    });

    const pendingPurchaseOrders = await PurchaseOrderModel.countDocuments({
      status: { $in: ['Draft', 'Pending'] },
    });

    const consumables = await ConsumableModel.find({ is_active: true });
    const lowStockAlerts = consumables.filter((item) => {
      const total = item.total_quantity || 0;
      if (total <= 0) return false;
      return (item.available_quantity || 0) <= total * 0.2;
    }).length;

    return {
      totalAssets,
      totalAssetItems,
      assignedItems,
      availableItems,
      maintenanceItems,
      totalValue,
      recentAssignments,
      pendingPurchaseOrders,
      lowStockAlerts,
    };
  },
  getAssetsByCategoryInternal: async () => {
    const assets = await AssetModel.find();
    const categories = await CategoryModel.find();
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const counts = new Map<string, number>();
    assets.forEach((asset) => {
      const categoryId = asset.category_id ? asset.category_id.toString() : 'uncategorized';
      const current = counts.get(categoryId) || 0;
      counts.set(categoryId, current + (asset.quantity || 1));
    });

    const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
    return Array.from(counts.entries()).map(([categoryId, count]) => ({
      categoryId,
      categoryName: categoryId === 'uncategorized' ? 'Uncategorized' : categoryMap.get(categoryId) || 'Uncategorized',
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  },
  getAssetsByStatusInternal: async () => {
    const assetItems = await AssetItemModel.find();
    if (!assetItems.length) return [];

    const counts = new Map<string, number>();
    assetItems.forEach((item) => {
      const status = item.item_status || 'Unknown';
      counts.set(status, (counts.get(status) || 0) + 1);
    });

    const total = assetItems.length;
    return Array.from(counts.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  },
  getRecentActivityInternal: async (limit: number) => {
    const activities: Array<{ id: string; type: string; description: string; timestamp: string; user?: string }> = [];

    const assignments = await AssignmentModel.find().sort({ created_at: -1 }).limit(limit);
    const maintenanceRecords = await MaintenanceRecordModel.find().sort({ created_at: -1 }).limit(limit);
    const newAssets = await AssetModel.find().sort({ created_at: -1 }).limit(limit);

    const employeeIds = [...new Set(assignments.map((a) => a.employee_id.toString()))];
    const employees = await EmployeeModel.find({ _id: { $in: employeeIds } });
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    assignments.forEach((assignment) => {
      const employee = employeeMap.get(assignment.employee_id.toString());
      activities.push({
        id: assignment.id,
        type: 'assignment',
        description: employee
          ? `Asset assigned to ${employee.first_name} ${employee.last_name}`
          : 'Asset assigned',
        timestamp: assignment.assigned_date,
        user: employee ? `${employee.first_name} ${employee.last_name}` : undefined,
      });
    });

    maintenanceRecords.forEach((record) => {
      activities.push({
        id: record.id,
        type: 'maintenance',
        description: record.description || 'Maintenance record updated',
        timestamp: record.created_at || record.scheduled_date || new Date().toISOString(),
        user: record.performed_by || undefined,
      });
    });

    newAssets.forEach((asset) => {
      activities.push({
        id: asset.id,
        type: 'new_asset',
        description: `New asset added: ${asset.name}`,
        timestamp: asset.created_at || asset.acquisition_date || new Date().toISOString(),
      });
    });

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return activities.slice(0, limit);
  },
};
