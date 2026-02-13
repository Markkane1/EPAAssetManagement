import api from '@/lib/api';
import { Category } from '@/types';

export interface CategoryCreateDto {
  name: string;
  description?: string;
}

export interface CategoryUpdateDto {
  name?: string;
  description?: string;
}

export const categoryService = {
  getAll: () => api.get<Category[]>('/categories'),
  
  getById: (id: string) => api.get<Category>(`/categories/${id}`),
  
  create: (data: CategoryCreateDto) => api.post<Category>('/categories', data),
  
  update: (id: string, data: CategoryUpdateDto) => api.put<Category>(`/categories/${id}`, data),
  
  delete: (id: string) => api.delete(`/categories/${id}`),
};

export default categoryService;

