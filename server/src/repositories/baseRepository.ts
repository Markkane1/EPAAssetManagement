import { Model, Document } from 'mongoose';

function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeObject(entry));
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      sanitized[key] = sanitizeObject(entry);
    }
    return sanitized;
  }
  return value;
}

export function createRepository<T extends Document>(model: Model<T>) {
  return {
    findAll: () => model.find(),
    findById: (id: string) => model.findById(id),
    create: (data: Record<string, unknown>) =>
      model.create(sanitizeObject(data) as Record<string, unknown>),
    updateById: (id: string, data: Record<string, unknown>) => {
      const sanitizedData = sanitizeObject(data) as Record<string, unknown>;
      return model.findByIdAndUpdate(id, { $set: sanitizedData }, { new: true, runValidators: true });
    },
    deleteById: (id: string) => model.findByIdAndDelete(id),
  };
}
