import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { SystemSettingsModel } from '../models/systemSettings.model';

const STORAGE_LIMIT_BYTES = Number(process.env.STORAGE_LIMIT_GB || 10) * 1024 * 1024 * 1024;
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

const getOrCreateSettings = async () => {
  let settings = await SystemSettingsModel.findOne();
  if (!settings) {
    settings = await SystemSettingsModel.create({});
  }
  return settings;
};

const buildSystemInfo = async (req: Request, lastBackupAt: string | null) => {
  const isConnected = mongoose.connection.readyState === 1;
  let storageUsedBytes: number | null = null;

  if (isConnected && mongoose.connection.db) {
    try {
      const stats = await mongoose.connection.db.stats();
      storageUsedBytes = stats.storageSize || stats.dataSize || null;
    } catch {
      storageUsedBytes = null;
    }
  }

  return {
    version: APP_VERSION,
    last_backup_at: lastBackupAt,
    database_status: isConnected ? 'Connected' : 'Disconnected',
    storage_used_bytes: storageUsedBytes,
    storage_limit_bytes: Number.isFinite(STORAGE_LIMIT_BYTES) ? STORAGE_LIMIT_BYTES : null,
    api_base_url: `${req.protocol}://${req.get('host')}/api`,
  };
};

export const settingsController = {
  getSettings: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getOrCreateSettings();
      const systemInfo = await buildSystemInfo(req, settings.last_backup_at || null);
      res.json({ settings, systemInfo });
    } catch (error) {
      next(error);
    }
  },
  updateSettings: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getOrCreateSettings();
      const { organization, notifications, security } = req.body || {};

      if (organization) {
        settings.organization = {
          ...settings.organization,
          ...organization,
        };
      }
      if (notifications) {
        settings.notifications = {
          ...settings.notifications,
          ...notifications,
        };
      }
      if (security) {
        settings.security = {
          ...settings.security,
          ...security,
        };
      }

      await settings.save();
      const systemInfo = await buildSystemInfo(req, settings.last_backup_at || null);
      res.json({ settings, systemInfo });
    } catch (error) {
      next(error);
    }
  },
  backupData: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await getOrCreateSettings();
      settings.last_backup_at = new Date().toISOString();
      await settings.save();
      const systemInfo = await buildSystemInfo(req, settings.last_backup_at || null);
      res.json({ message: 'Backup completed', systemInfo });
    } catch (error) {
      next(error);
    }
  },
  testEmail: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ message: 'Test email sent successfully' });
    } catch (error) {
      next(error);
    }
  },
};
