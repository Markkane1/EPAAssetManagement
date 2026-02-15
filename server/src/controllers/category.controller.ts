import { Request, Response, NextFunction } from 'express';
import { CategoryModel } from '../models/category.model';
import { createHttpError } from '../utils/httpError';

const CATEGORY_SCOPES = new Set(['GENERAL', 'LAB_ONLY']);

function parseScope(value: unknown, fallback: 'GENERAL' | 'LAB_ONLY' = 'GENERAL') {
  if (value === undefined || value === null || value === '') return fallback;
  const scope = String(value).trim().toUpperCase();
  if (!CATEGORY_SCOPES.has(scope)) {
    throw createHttpError(400, 'scope must be one of: GENERAL, LAB_ONLY');
  }
  return scope as 'GENERAL' | 'LAB_ONLY';
}

function parseName(value: unknown) {
  const name = String(value || '').trim();
  if (!name) {
    throw createHttpError(400, 'name is required');
  }
  return name;
}

function parseDescription(value: unknown) {
  if (value === undefined) return undefined;
  const description = String(value || '').trim();
  return description || null;
}

export const categoryController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await CategoryModel.find().sort({ name: 1 });
      res.json(categories);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await CategoryModel.findById(req.params.id);
      if (!category) return res.status(404).json({ message: 'Not found' });
      res.json(category);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload: Record<string, unknown> = {
        name: parseName((req.body as Record<string, unknown>).name),
        scope: parseScope((req.body as Record<string, unknown>).scope, 'GENERAL'),
      };
      const description = parseDescription((req.body as Record<string, unknown>).description);
      if (description !== undefined) payload.description = description;

      const category = await CategoryModel.create(payload);
      res.status(201).json(category);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const payload: Record<string, unknown> = {};
      if (body.name !== undefined) payload.name = parseName(body.name);
      if (body.description !== undefined) payload.description = parseDescription(body.description);
      if (body.scope !== undefined) payload.scope = parseScope(body.scope);

      const category = await CategoryModel.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
      });
      if (!category) return res.status(404).json({ message: 'Not found' });
      res.json(category);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await CategoryModel.findByIdAndDelete(req.params.id);
      if (!category) return res.status(404).json({ message: 'Not found' });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

