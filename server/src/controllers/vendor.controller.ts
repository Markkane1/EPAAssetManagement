import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { vendorRepository } from '../repositories/vendor.repository';
import { VendorModel } from '../models/vendor.model';
import { escapeRegex, readPagination } from '../utils/requestParsing';

const baseController = createCrudController({
  repository: vendorRepository,
  createMap: {
    contactInfo: 'contact_info',
  },
  updateMap: {
    contactInfo: 'contact_info',
  },
});

export const vendorController = {
  ...baseController,
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 1000 });
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      const filter: Record<string, unknown> = {};
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
      }

      const vendors = await VendorModel.find(
        filter,
        { name: 1, contact_info: 1, email: 1, phone: 1, address: 1, created_at: 1 }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(vendors);
    } catch (error) {
      next(error);
    }
  },
};
