import { createCrudController } from './crudController';
import { categoryRepository } from '../repositories/category.repository';

export const categoryController = createCrudController({
  repository: categoryRepository,
});
