import fs from 'fs/promises';
import { Response, NextFunction, Request } from 'express';
import type { Express } from 'express';
import { inventoryService } from '../services/inventory.service';
import type { AuthRequest } from '../../../middleware/auth';
import { assertUploadedFileIntegrity } from '../../../utils/uploadValidation';
import { createHttpError } from '../../../utils/httpError';
import { getRequestContext } from '../../../utils/scope';
import { logAudit } from '../../records/services/audit.service';

function extractEntityId(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const id = r._id ?? r.id;
  return id ? String(id) : null;
}

async function tryLogAudit(
  req: AuthRequest,
  action: string,
  entityType: string,
  result: unknown,
  officeIdFallback: string | null | undefined
) {
  try {
    const entityId = extractEntityId(result);
    if (!entityId) return;
    const ctx = await getRequestContext(req);
    const officeId = officeIdFallback || ctx.locationId;
    if (!officeId) return;
    await logAudit({ ctx, action, entityType, entityId, officeId });
  } catch {
    // Audit failures must never surface to the caller
  }
}

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
    roles: req.user.roles || [req.user.role],
    email: req.user.email,
    locationId: req.user.locationId ?? null,
    isOrgAdmin: Boolean(req.user.isOrgAdmin),
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
      await tryLogAudit(req, 'CONSUMABLE_RECEIVED', 'ConsumableLot', result, user.locationId);
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
  receiveOffice: async (req: AuthRequestWithFile, res: Response, next: NextFunction) => {
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
      const result = await inventoryService.receiveOffice(user, req.body, uploadedFile || undefined);
      await tryLogAudit(req, 'CONSUMABLE_RECEIVED', 'ConsumableLot', result, user.locationId);
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
      await tryLogAudit(req, 'CONSUMABLE_TRANSFERRED', 'ConsumableItem', result, user.locationId);
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
      await tryLogAudit(req, 'CONSUMABLE_CONSUMED', 'ConsumableItem', result, user.locationId);
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
      await tryLogAudit(req, 'CONSUMABLE_ADJUSTED', 'ConsumableItem', result, user.locationId);
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
      await tryLogAudit(req, 'CONSUMABLE_DISPOSED', 'ConsumableItem', result, user.locationId);
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
      await tryLogAudit(req, 'CONSUMABLE_RETURNED', 'ConsumableItem', result, user.locationId);
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
      await tryLogAudit(req, 'CONSUMABLE_OPENING_BALANCE', 'ConsumableItem', result, user.locationId);
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
