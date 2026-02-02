import api from '@/lib/api';
import { AssetItem, AssetStatus, AssetCondition, ItemSource, AssignmentStatus, FunctionalStatus } from '@/types';

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

export const assetItemService = {
  getAll: () => api.get<AssetItem[]>('/asset-items'),
  
  getById: (id: string) => api.get<AssetItem>(`/asset-items/${id}`),
  
  getByAsset: (assetId: string) => api.get<AssetItem[]>(`/asset-items/asset/${assetId}`),

  getByLocation: (locationId: string) => api.get<AssetItem[]>(`/asset-items/location/${locationId}`),

  getAvailable: () => api.get<AssetItem[]>('/asset-items/available'),
  
  create: (data: AssetItemCreateDto) => api.post<AssetItem>('/asset-items', data),

  createMany: (data: AssetItemBatchCreateDto) => api.post<AssetItem[]>('/asset-items/batch', data),
  
  update: (id: string, data: AssetItemUpdateDto) => api.put<AssetItem>(`/asset-items/${id}`, data),
  
  delete: (id: string) => api.delete(`/asset-items/${id}`),
};

export default assetItemService;

