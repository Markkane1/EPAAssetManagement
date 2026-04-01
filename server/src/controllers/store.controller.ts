import { Request, Response, NextFunction } from 'express';
import { StoreModel } from '../models/store.model';
import { resolveHeadOfficeStore } from './transfer.controller.helpers';

export const storeController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await resolveHeadOfficeStore();
      const stores = await StoreModel.find(
        { is_active: { $ne: false } },
        {
          name: 1,
          code: 1,
          is_system: 1,
          is_active: 1,
          created_at: 1,
          updated_at: 1,
        }
      )
        .sort({ is_system: -1, name: 1, created_at: -1 })
        .lean();
      return res.json(
        stores.map((store: any) => ({
          ...store,
          id: store?._id?.toString?.() ?? String(store?._id || ''),
        }))
      );
    } catch (error) {
      next(error);
    }
  },
};
