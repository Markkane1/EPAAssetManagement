import api from '@/lib/api';
import { Category, CategoryAssetType, CategoryScope } from '@/types';

const LIST_LIMIT = 1000;

export interface CategoryListParams {
  scope?: CategoryScope;
  assetType?: CategoryAssetType;
  search?: string;
}

export interface CategoryCreateDto {
  name: string;
  description?: string;
  scope?: CategoryScope;
  assetType?: CategoryAssetType;
}

export interface CategoryUpdateDto {
  name?: string;
  description?: string;
  scope?: CategoryScope;
  assetType?: CategoryAssetType;
}

export const categoryService = {
  getAll: (params?: CategoryListParams) => {
    const query = new URLSearchParams({ limit: String(LIST_LIMIT) });
    if (params?.scope) query.set('scope', params.scope);
    if (params?.assetType) query.set('assetType', params.assetType);
    if (params?.search?.trim()) query.set('search', params.search.trim());
    return api.get<Category[]>(`/categories?${query.toString()}`);
  },
  
  getById: (id: string) => api.get<Category>(`/categories/${id}`),
  
  create: (data: CategoryCreateDto) => api.post<Category>('/categories', data),
  
  update: (id: string, data: CategoryUpdateDto) => api.put<Category>(`/categories/${id}`, data),
  
  delete: (id: string) => api.delete(`/categories/${id}`),
};

export default categoryService;

