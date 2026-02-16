import api from '@/lib/api';
import { Category } from '@/types';

const LIST_LIMIT = 1000;

export interface CategoryCreateDto {
  name: string;
  description?: string;
  scope?: 'GENERAL' | 'LAB_ONLY';
}

export interface CategoryUpdateDto {
  name?: string;
  description?: string;
  scope?: 'GENERAL' | 'LAB_ONLY';
}

export const categoryService = {
  getAll: () => api.get<Category[]>(`/categories?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<Category>(`/categories/${id}`),
  
  create: (data: CategoryCreateDto) => api.post<Category>('/categories', data),
  
  update: (id: string, data: CategoryUpdateDto) => api.put<Category>(`/categories/${id}`, data),
  
  delete: (id: string) => api.delete(`/categories/${id}`),
};

export default categoryService;

