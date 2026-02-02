import { Response, NextFunction } from 'express';
import { ConsumableConsumptionModel } from '../models/consumableConsumption.model';
import { ConsumableModel } from '../models/consumable.model';
import { UserModel } from '../models/user.model';
import type { AuthRequest } from '../middleware/auth';

export const consumableConsumptionController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit || 200);
      const locationId = String(req.query.locationId || '').trim();
      let filter: Record<string, unknown> = {};

      if (req.user?.role === 'location_admin') {
        const user = await UserModel.findById(req.user.userId);
        if (!user?.location_id) {
          return res.json([]);
        }
        filter = { location_id: user.location_id };
      } else if (locationId) {
        filter = { location_id: locationId };
      }

      const logs = await ConsumableConsumptionModel.find(filter)
        .sort({ consumed_at: -1 })
        .limit(limit);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  },
  consume: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { consumableId, locationId } = req.body as {
        consumableId?: string;
        locationId?: string;
      };

      if (!consumableId || !locationId) {
        return res.status(400).json({ message: 'Consumable and location are required' });
      }

      if (req.user?.role === 'location_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const consumable = await ConsumableModel.findById(consumableId);
      if (!consumable) return res.status(404).json({ message: 'Consumable not found' });

      const available = consumable.available_quantity || 0;
      if (available <= 0) {
        return res.status(400).json({ message: 'No available quantity to consume' });
      }

      consumable.available_quantity = 0;
      await consumable.save();

      const log = await ConsumableConsumptionModel.create({
        consumable_id: consumableId,
        location_id: locationId,
        available_quantity: available,
        consumed_quantity: available,
        remaining_quantity: 0,
        consumed_at: new Date().toISOString(),
      });

      res.status(201).json(log);
    } catch (error) {
      next(error);
    }
  },
};
