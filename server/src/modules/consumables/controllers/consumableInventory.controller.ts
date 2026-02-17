import fs from 'fs/promises';
import { Response, NextFunction, Request } from 'express';
import type { Express } from 'express';
import { inventoryService } from '../services/inventory.service';
import type { AuthRequest } from '../../../middleware/auth';
import { assertUploadedFileIntegrity } from '../../../utils/uploadValidation';
import { createHttpError } from '../../../utils/httpError';

type AuthRequestWithFile = AuthRequest & {
  file?: Express.Multer.File;
};

function getAuthUser(req: AuthRequest) {
  if (!req.user) {
    return null;
  }
  return {
    userId: req.user.userId,
    role: req.user.role,
    email: req.user.email,
  };
}

export const consumableInventoryController = {
  receive: async (req: AuthRequestWithFile, res: Response, next: NextFunction) => {
    const uploadedFile = req.file || null;
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      if (uploadedFile) {
        await assertUploadedFileIntegrity(uploadedFile, 'handoverDocumentation');
        if (uploadedFile.mimetype !== 'application/pdf') {
          throw createHttpError(400, 'handoverDocumentation must be a PDF file');
        }
      }
      const result = await inventoryService.receive(user, req.body, uploadedFile || undefined);
      res.status(201).json(result);
    } catch (error) {
      if (uploadedFile?.path) {
        try {
          await fs.unlink(uploadedFile.path);
        } catch {
          // ignore cleanup failures
        }
      }
      next(error);
    }
  },
  transfer: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.transfer(user, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
  consume: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.consume(user, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
  adjust: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.adjust(user, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
  dispose: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.dispose(user, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
  returnToCentral: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.returnToCentral(user, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
  openingBalance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.openingBalance(user, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
  balance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.getBalance(user, req.query);
      res.json(result || null);
    } catch (error) {
      next(error);
    }
  },
  balances: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.getBalances(user, req.query);
      res.json(result || []);
    } catch (error) {
      next(error);
    }
  },
  rollup: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.getRollup(user, req.query);
      res.json(result || []);
    } catch (error) {
      next(error);
    }
  },
  ledger: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.getLedger(user, req.query);
      res.json(result || []);
    } catch (error) {
      next(error);
    }
  },
  expiry: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      const result = await inventoryService.getExpiry(user, req.query);
      res.json(result || []);
    } catch (error) {
      next(error);
    }
  },
};
