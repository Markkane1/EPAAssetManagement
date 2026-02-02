import { CategoryModel } from '../models/category.model';
import { createRepository } from './baseRepository';

export const categoryRepository = createRepository(CategoryModel);
