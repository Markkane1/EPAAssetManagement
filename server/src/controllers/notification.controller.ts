import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { createHttpError } from '../utils/httpError';
import { NotificationModel } from '../models/notification.model';

function parseBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw createHttpError(400, 'unreadOnly must be a boolean');
}

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function readParamId(req: AuthRequest, key: string) {
  const raw = req.params?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export const notificationController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw createHttpError(401, 'Unauthorized');

      const unreadOnly = parseBoolean(req.query.unreadOnly, false);
      const limit = clampInt(req.query.limit, 50, 100);
      const page = clampInt(req.query.page, 1, 100_000);
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {
        recipient_user_id: userId,
      };
      if (unreadOnly) filter.is_read = false;

      const [data, total] = await Promise.all([
        NotificationModel.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        NotificationModel.countDocuments(filter),
      ]);

      return res.json({
        data,
        page,
        limit,
        total,
      });
    } catch (error) {
      return next(error);
    }
  },

  markRead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw createHttpError(401, 'Unauthorized');
      const notificationId = readParamId(req, 'id');
      if (!Types.ObjectId.isValid(notificationId)) {
        throw createHttpError(400, 'id is invalid');
      }

      const updated = await NotificationModel.findOneAndUpdate(
        { _id: notificationId, recipient_user_id: userId },
        { $set: { is_read: true } },
        { new: true }
      ).lean();

      if (!updated) {
        throw createHttpError(404, 'Notification not found');
      }
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  },

  markAllRead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw createHttpError(401, 'Unauthorized');

      const result = await NotificationModel.updateMany(
        { recipient_user_id: userId, is_read: false },
        { $set: { is_read: true } }
      );

      return res.json({
        matched: result.matchedCount,
        modified: result.modifiedCount,
      });
    } catch (error) {
      return next(error);
    }
  },
};


