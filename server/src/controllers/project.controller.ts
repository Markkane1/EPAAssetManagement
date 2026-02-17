import { Request, Response, NextFunction } from 'express';
import { createCrudController } from './crudController';
import { projectRepository } from '../repositories/project.repository';
import { ProjectModel } from '../models/project.model';
import { escapeRegex, readPagination } from '../utils/requestParsing';
import { createHttpError } from '../utils/httpError';

const baseController = createCrudController({
  repository: projectRepository,
  createMap: {
    startDate: 'start_date',
    endDate: 'end_date',
    isActive: 'is_active',
  },
  updateMap: {
    startDate: 'start_date',
    endDate: 'end_date',
    isActive: 'is_active',
  },
});

const fieldMap = {
  startDate: 'start_date',
  endDate: 'end_date',
  isActive: 'is_active',
};

function buildPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = { ...body };
  Object.entries(fieldMap).forEach(([dtoKey, dbKey]) => {
    if (body[dtoKey] !== undefined) {
      payload[dbKey] = body[dtoKey];
      delete payload[dtoKey];
    }
  });
  return payload;
}

function toTrimmed(value: unknown) {
  return String(value ?? '').trim();
}

function toDate(value: unknown) {
  const parsed = new Date(String(value ?? ''));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function assertProjectDates(payload: Record<string, unknown>) {
  const startDate = toTrimmed(payload.start_date);
  const endDate = toTrimmed(payload.end_date);

  if (!startDate) {
    throw createHttpError(400, 'startDate is required');
  }
  if (!endDate) {
    throw createHttpError(400, 'endDate is required');
  }

  const start = toDate(startDate);
  if (!start) {
    throw createHttpError(400, 'startDate is invalid');
  }
  const end = toDate(endDate);
  if (!end) {
    throw createHttpError(400, 'endDate is invalid');
  }
  if (start >= end) {
    throw createHttpError(400, 'endDate must be later than startDate');
  }
}

export const projectController = {
  ...baseController,
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body || {});
      assertProjectDates(payload);
      const created = await projectRepository.create(payload);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await projectRepository.findById(String(req.params.id || '').trim());
      if (!existing) {
        return res.status(404).json({ message: 'Not found' });
      }

      const incoming = buildPayload(req.body || {});
      const merged: Record<string, unknown> = {
        ...(typeof (existing as any).toObject === 'function' ? (existing as any).toObject() : (existing as any)),
        ...incoming,
      };
      assertProjectDates(merged);

      const updated = await projectRepository.updateById(String(req.params.id || '').trim(), incoming);
      if (!updated) {
        return res.status(404).json({ message: 'Not found' });
      }
      return res.json(updated);
    } catch (error) {
      next(error);
    }
  },
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 1000 });
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      const filter: Record<string, unknown> = {};
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { code: regex }];
      }

      const projects = await ProjectModel.find(
        filter,
        { name: 1, code: 1, description: 1, start_date: 1, end_date: 1, budget: 1, is_active: 1, created_at: 1 }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(projects);
    } catch (error) {
      next(error);
    }
  },
  getActive: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, skip } = readPagination(req.query as Record<string, unknown>, { defaultLimit: 200, maxLimit: 1000 });
      const search = String((req.query as Record<string, unknown>).search || '').trim();
      const filter: Record<string, unknown> = { is_active: true };
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: regex }, { code: regex }];
      }

      const projects = await ProjectModel.find(filter, { name: 1, code: 1, start_date: 1, end_date: 1, is_active: 1 })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(projects);
    } catch (error) {
      next(error);
    }
  },
};
