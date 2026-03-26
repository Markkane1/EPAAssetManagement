import api from '@/lib/api';
import { AssetItem, AssetStatus, AssetCondition, ItemSource, AssignmentStatus, FunctionalStatus } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';

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

export type AssetItemListQuery = ListQuery;

export const assetItemService = {
  getAll: (query: AssetItemListQuery = {}) =>
    api.get<AssetItem[]>(`/asset-items${toListQueryString({ limit: LIST_LIMIT, ...query })}`),

  getPaged: (query: AssetItemListQuery = {}) =>
    api.get<PagedListResponse<AssetItem>>(
      `/asset-items${toListQueryString({ limit: LIST_LIMIT, ...query, meta: true })}`
    ),
  
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

