import api from '@/lib/api';
import { TransferHistory } from '@/types';

export interface TransferCreateDto {
  assetItemId: string;
  fromLocationId?: string;
  toLocationId: string;
  transferDate: string;
  reason?: string;
  performedBy?: string;
}

export const transferService = {
  getAll: () => api.get<TransferHistory[]>('/transfers'),
  
  getById: (id: string) => api.get<TransferHistory>(`/transfers/${id}`),
  
  getByAssetItem: (assetItemId: string) => api.get<TransferHistory[]>(`/transfers/asset-item/${assetItemId}`),
  
  getByLocation: (locationId: string) => api.get<TransferHistory[]>(`/transfers/location/${locationId}`),

  getRecent: (limit?: number) => api.get<TransferHistory[]>(`/transfers/recent${limit ? `?limit=${limit}` : ''}`),
  
  create: (data: TransferCreateDto) => api.post<TransferHistory>('/transfers', data),
  
  delete: (id: string) => api.delete(`/transfers/${id}`),
};

export default transferService;

