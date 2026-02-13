import { Request, Response, NextFunction } from 'express';

type Repository = {
  findAll: () => Promise<unknown[]>;
  findById: (id: string) => Promise<unknown | null>;
  create: (data: Record<string, unknown>) => Promise<unknown>;
  updateById: (id: string, data: Record<string, unknown>) => Promise<unknown | null>;
  deleteById: (id: string) => Promise<unknown | null>;
};

type CrudConfig = {
  repository: Repository;
  createMap?: Record<string, string>;
  updateMap?: Record<string, string>;
};

function buildPayload(body: Record<string, unknown>, fieldMap?: Record<string, string>) {
  if (!fieldMap) return { ...body };
  const payload = { ...body };
  Object.entries(fieldMap).forEach(([dtoKey, dbKey]) => {
    if (body[dtoKey] !== undefined) {
      payload[dbKey] = body[dtoKey];
      delete payload[dtoKey];
    }
  });
  return payload;
}

export function createCrudController(config: CrudConfig) {
  const { repository, createMap, updateMap } = config;

  return {
    list: async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await repository.findAll();
        res.json(data);
      } catch (error) {
        next(error);
      }
    },
    getById: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await repository.findById(req.params.id);
        if (!data) return res.status(404).json({ message: 'Not found' });
        return res.json(data);
      } catch (error) {
        next(error);
      }
    },
    create: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = buildPayload(req.body, createMap);
        const data = await repository.create(payload);
        return res.status(201).json(data);
      } catch (error) {
        next(error);
      }
    },
    update: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = buildPayload(req.body, updateMap);
        const data = await repository.updateById(req.params.id, payload);
        if (!data) return res.status(404).json({ message: 'Not found' });
        return res.json(data);
      } catch (error) {
        next(error);
      }
    },
    remove: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = await repository.deleteById(req.params.id);
        if (!data) return res.status(404).json({ message: 'Not found' });
        return res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  };
}
