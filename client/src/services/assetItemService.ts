import api from '@/lib/api';
import { AssetItem, AssetStatus, AssetCondition, ItemSource, AssignmentStatus, FunctionalStatus } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';
import { fetchAllPages } from '@/services/fetchAllPages';

export interface AssetItemCreateDto {
  assetId: string;
  locationId?: string;
  serialNumber?: string;
  tag?: string;
  assignmentStatus?: AssignmentStatus;
  itemStatus?: AssetStatus;
  itemCondition?: AssetCondition;
  functionalStatus?: FunctionalStatus;
  itemSource?: ItemSource;
  purchaseDate?: string;
  warrantyExpiry?: string;
  notes?: string;
}

export interface AssetItemBatchCreateDto {
  assetId: string;
  locationId: string;
  itemStatus: AssetStatus;
  itemCondition: AssetCondition;
  functionalStatus?: FunctionalStatus;
  notes?: string;
  items: Array<{ serialNumber: string; warrantyExpiry?: string }>;
}

export interface AssetItemUpdateDto {
  assetId?: string;
  locationId?: string;
  serialNumber?: string;
  tag?: string;
  assignmentStatus?: AssignmentStatus;
  itemStatus?: AssetStatus;
  itemCondition?: AssetCondition;
  functionalStatus?: FunctionalStatus;
  itemSource?: ItemSource;
  purchaseDate?: string;
  warrantyExpiry?: string;
  notes?: string;
}

const LIST_LIMIT = 1000;

export interface AssetItemListQuery extends ListQuery {
  search?: string;
  assetId?: string;
  assetName?: string;
  categoryId?: string;
  subcategory?: string;
}

function buildAssetItemQuery(query: AssetItemListQuery = {}, meta = false) {
  const params = new URLSearchParams();
  const pagination = toListQueryString({ ...query, meta });
  if (pagination.startsWith('?')) {
    const queryString = new URLSearchParams(pagination.slice(1));
    queryString.forEach((value, key) => params.set(key, value));
  }
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.assetId?.trim()) params.set('assetId', query.assetId.trim());
  if (query.assetName?.trim()) params.set('assetName', query.assetName.trim());
  if (query.categoryId?.trim()) params.set('categoryId', query.categoryId.trim());
  if (query.subcategory?.trim()) params.set('subcategory', query.subcategory.trim());
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const assetItemService = {
  getAll: (query: AssetItemListQuery = {}) =>
    fetchAllPages(
      query,
      (pagedQuery) => api.get<PagedListResponse<AssetItem>>(`/asset-items${buildAssetItemQuery({ limit: LIST_LIMIT, ...pagedQuery }, true)}`),
      { pageSize: LIST_LIMIT }
    ),

  getPaged: (query: AssetItemListQuery = {}) =>
    api.get<PagedListResponse<AssetItem>>(`/asset-items${buildAssetItemQuery({ limit: LIST_LIMIT, ...query }, true)}`),
  
  getById: (id: string) => api.get<AssetItem>(`/asset-items/${id}`),
  
  getByAsset: (assetId: string) => api.get<AssetItem[]>(`/asset-items/asset/${assetId}?limit=${LIST_LIMIT}`),

  getByLocation: (locationId: string) =>
    api.get<AssetItem[]>(`/asset-items/location/${locationId}?limit=${LIST_LIMIT}`),

  getAvailable: () => api.get<AssetItem[]>(`/asset-items/available?limit=${LIST_LIMIT}`),
  
  create: (data: AssetItemCreateDto) => api.post<AssetItem>('/asset-items', data),

  createMany: (data: AssetItemBatchCreateDto) => api.post<AssetItem[]>('/asset-items/batch', data),
  
  update: (id: string, data: AssetItemUpdateDto) => api.put<AssetItem>(`/asset-items/${id}`, data),
  
  delete: (id: string) => api.delete(`/asset-items/${id}`),
};

export default assetItemService;

