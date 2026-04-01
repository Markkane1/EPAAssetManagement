import api from '@/lib/api';
import { normalizeCategory, normalizeCategoryCollection } from '@/lib/categoryNormalization';
import { Category, CategoryAssetType, CategoryScope } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';
import { fetchAllPages } from '@/services/fetchAllPages';

const LIST_LIMIT = 1000;

export interface CategoryListParams extends ListQuery {
  scope?: CategoryScope;
  assetType?: CategoryAssetType;
  search?: string;
}

export interface CategoryCountsResponse {
  assets: Record<string, number>;
  consumables: Record<string, number>;
}

export interface CategoryCreateDto {
  name: string;
  description?: string;
  subcategories?: string[];
  scope?: CategoryScope;
  assetType?: CategoryAssetType;
}

export interface CategoryUpdateDto {
  name?: string;
  description?: string;
  subcategories?: string[];
  scope?: CategoryScope;
  assetType?: CategoryAssetType;
}

function buildCategoryQuery(params: CategoryListParams = {}, meta = false) {
  const query = new URLSearchParams();
  const pagination = toListQueryString({ limit: LIST_LIMIT, ...params, meta });
  if (pagination.startsWith('?')) {
    const queryString = new URLSearchParams(pagination.slice(1));
    queryString.forEach((value, key) => query.set(key, value));
  }
  if (params.scope) query.set('scope', params.scope);
  if (params.assetType) query.set('assetType', params.assetType);
  if (params.search?.trim()) query.set('search', params.search.trim());
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export const categoryService = {
  getAll: (params: CategoryListParams = {}) =>
    fetchAllPages(
      params,
      async (pagedParams) => {
        const response = await api.get<PagedListResponse<Category>>(`/categories${buildCategoryQuery(pagedParams, true)}`);
        return {
          ...response,
          items: normalizeCategoryCollection(response.items),
        };
      },
      { pageSize: LIST_LIMIT }
    ),

  getPaged: (params: CategoryListParams = {}) =>
    api
      .get<PagedListResponse<Category>>(`/categories${buildCategoryQuery(params, true)}`)
      .then((response) => ({ ...response, items: normalizeCategoryCollection(response.items) })),

  getCounts: (ids: string[]) =>
    api.get<CategoryCountsResponse>(`/categories/counts?ids=${encodeURIComponent(ids.join(','))}`),
  
  getById: (id: string) => api.get<Category>(`/categories/${id}`).then((category) => normalizeCategory(category)),
  
  create: (data: CategoryCreateDto) => api.post<Category>('/categories', data).then((category) => normalizeCategory(category)),
  
  update: (id: string, data: CategoryUpdateDto) =>
    api.put<Category>(`/categories/${id}`, data).then((category) => normalizeCategory(category)),
  
  delete: (id: string) => api.delete(`/categories/${id}`),
};

export default categoryService;

