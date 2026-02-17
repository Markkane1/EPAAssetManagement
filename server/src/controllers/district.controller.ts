import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { DistrictModel } from '../models/district.model';
import { DivisionModel } from '../models/division.model';

const baseController = createCrudController({
  repository: {
    findAll: () => DistrictModel.find().sort({ created_at: -1 }),
    findById: (id: string) => DistrictModel.findById(id),
    create: (data: Record<string, unknown>) => DistrictModel.create(data),
    updateById: (id: string, data: Record<string, unknown>) =>
      DistrictModel.findByIdAndUpdate(id, data, { new: true }),
    deleteById: (id: string) => DistrictModel.findByIdAndDelete(id),
  },
});

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readDivisionId(body: Record<string, unknown>, required: boolean) {
  const source = body.division_id ?? body.divisionId;
  if (source === undefined) {
    if (required) {
      throw new Error('Division is required');
    }
    return undefined;
  }
  const divisionId = String(source || '').trim();
  if (!divisionId) {
    throw new Error('Division is required');
  }
  if (!/^[a-f\d]{24}$/i.test(divisionId)) {
    throw new Error('Division id is invalid');
  }
  return divisionId;
}

async function ensureDivisionExists(divisionId: string) {
  const exists = await DivisionModel.exists({ _id: divisionId });
  if (!exists) {
    throw new Error('Division not found');
  }
}

export const districtController = {
  ...baseController,
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { divisionId } = req.query;
      const filter: Record<string, unknown> = {};
      if (divisionId) {
        filter.division_id = divisionId;
      }
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const data = await DistrictModel.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const divisionId = readDivisionId(body, true);
      await ensureDivisionExists(String(divisionId));
      const payload: Record<string, unknown> = {
        ...body,
        division_id: divisionId,
      };
      delete payload.divisionId;
      const data = await DistrictModel.create(payload);
      res.status(201).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create district';
      if (message === 'Division is required' || message === 'Division id is invalid') {
        return res.status(400).json({ message });
      }
      if (message === 'Division not found') {
        return res.status(404).json({ message });
      }
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const divisionId = readDivisionId(body, false);
      const payload: Record<string, unknown> = { ...body };
      if (divisionId !== undefined) {
        await ensureDivisionExists(divisionId);
        payload.division_id = divisionId;
      }
      delete payload.divisionId;
      const updated = await DistrictModel.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
      });
      if (!updated) {
        return res.status(404).json({ message: 'Not found' });
      }
      return res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update district';
      if (message === 'Division is required' || message === 'Division id is invalid') {
        return res.status(400).json({ message });
      }
      if (message === 'Division not found') {
        return res.status(404).json({ message });
      }
      next(error);
    }
  },
};
