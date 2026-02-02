import { Request, Response, NextFunction } from 'express';
import { ActivityLogModel } from '../models/activityLog.model';
import { UserModel } from '../models/user.model';

export const activityController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit || 50);
      const activities = await ActivityLogModel.find().sort({ created_at: -1 }).limit(limit);

      const userIds = [...new Set(activities.map((a) => a.user_id.toString()))];
      const users = await UserModel.find({ _id: { $in: userIds } });
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
  getByUser: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Number(req.query.limit || 20);
      const activities = await ActivityLogModel.find({ user_id: req.params.userId })
        .sort({ created_at: -1 })
        .limit(limit);
      res.json(activities);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, activityType, description, metadata } = req.body as {
        userId: string;
        activityType: string;
        description?: string;
        metadata?: Record<string, unknown>;
      };

      const activity = await ActivityLogModel.create({
        user_id: userId,
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
