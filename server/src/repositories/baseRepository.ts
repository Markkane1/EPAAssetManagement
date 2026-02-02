import { Model, Document } from 'mongoose';

export function createRepository<T extends Document>(model: Model<T>) {
  return {
    findAll: () => model.find(),
    findById: (id: string) => model.findById(id),
    create: (data: Record<string, unknown>) => model.create(data),
    updateById: (id: string, data: Record<string, unknown>) =>
      model.findByIdAndUpdate(id, data, { new: true }),
    deleteById: (id: string) => model.findByIdAndDelete(id),
  };
}
