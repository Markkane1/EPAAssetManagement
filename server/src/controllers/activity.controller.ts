import { Request, Response, NextFunction } from 'express';
import { ActivityLogModel } from '../models/activityLog.model';
import { UserModel } from '../models/user.model';
import type { AuthRequest } from '../middleware/auth';
import { ADMIN_ROLES } from '../middleware/authorize';

function isAdmin(role?: string | null) {
  return Boolean(role && ADMIN_ROLES.has(role));
}

function clampInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

export const activityController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const limit = clampInt(req.query.limit, 50, 200);
      const page = clampInt(req.query.page, 1, 10_000);
      const skip = (page - 1) * limit;
      const query = isAdmin(req.user.role) ? {} : { user_id: req.user.userId };
      const activities = await ActivityLogModel.find(
        query,
        {
          user_id: 1,
          activity_type: 1,
          description: 1,
          metadata: 1,
          ip_address: 1,
          user_agent: 1,
          created_at: 1,
        }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const userIds = [...new Set(activities.map((a) => a.user_id.toString()))];
      const users = await UserModel.find(
        { _id: { $in: userIds } },
        { email: 1, first_name: 1, last_name: 1 }
      );
      const userMap = new Map(users.map((u) => [u.id, u]));

      const mapped = activities.map((activity) => {
        const user = userMap.get(activity.user_id.toString());
        return {
          ...activity.toJSON(),
          user_email: user?.email,
          user_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || undefined : undefined,
        };
      });

      res.json(mapped);
    } catch (error) {
      next(error);
    }
  },
  getByUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      const requestedUserId = req.params.userId;
      if (!isAdmin(req.user.role) && requestedUserId !== req.user.userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const limit = clampInt(req.query.limit, 20, 200);
      const page = clampInt(req.query.page, 1, 10_000);
      const activities = await ActivityLogModel.find({ user_id: requestedUserId })
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      res.json(activities);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

      const { activityType, description, metadata } = req.body as {
        activityType: string;
        description?: string;
        metadata?: Record<string, unknown>;
      };
      if (!activityType || typeof activityType !== 'string') {
        return res.status(400).json({ message: 'Activity type is required' });
      }

      const activity = await ActivityLogModel.create({
        user_id: req.user.userId,
        activity_type: activityType,
        description: description || null,
        metadata: metadata || {},
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || null,
      });

      res.status(201).json(activity);
    } catch (error) {
      next(error);
    }
  },
};
