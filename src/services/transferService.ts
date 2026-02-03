import api from '@/lib/api';
import { Transfer } from '@/types';

export type TransferStatus = 'REQUESTED' | 'APPROVED' | 'DISPATCHED' | 'RECEIVED';

export interface TransferCreateDto {
  assetItemId: string;
  fromOfficeId: string;
  toOfficeId: string;
  transferDate?: string;
  notes?: string;
}

export interface TransferStatusUpdateDto {
  status: TransferStatus;
}

export const transferService = {
  getAll: () => api.get<Transfer[]>('/transfers'),
  getByAssetItem: (assetItemId: string) =>
    api.get<Transfer[]>(`/transfers/asset-item/${assetItemId}`),
  getByOffice: (officeId: string) =>
    api.get<Transfer[]>(`/transfers/office/${officeId}`),
  create: (data: TransferCreateDto) => api.post<Transfer>('/transfers', data),
  updateStatus: (id: string, data: TransferStatusUpdateDto) =>
    api.put<Transfer>(`/transfers/${id}/status`, data),
  delete: (id: string) => api.delete(`/transfers/${id}`),
};

export default transferService;
