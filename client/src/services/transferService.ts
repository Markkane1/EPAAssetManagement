import api from '@/lib/api';
import { Transfer } from '@/types';

export type TransferStatus = 'REQUESTED' | 'APPROVED' | 'DISPATCHED' | 'RECEIVED';

export interface TransferCreateDto {
  assetItemId: string;
  fromOfficeId: string;
  toOfficeId: string;
  transferDate?: string;
  notes?: string;
  useWorkflow?: boolean;
}

export interface TransferStatusUpdateDto {
  status: TransferStatus;
}

const LIST_LIMIT = 1000;

export const transferService = {
  getAll: () => api.get<Transfer[]>(`/transfers?limit=${LIST_LIMIT}`),
  getByAssetItem: (assetItemId: string) =>
    api.get<Transfer[]>(`/transfers/asset-item/${assetItemId}?limit=${LIST_LIMIT}`),
  getByOffice: (officeId: string) =>
    api.get<Transfer[]>(`/transfers/office/${officeId}?limit=${LIST_LIMIT}`),
  create: (data: TransferCreateDto) => api.post<Transfer>('/transfers', data),
  updateStatus: (id: string, data: TransferStatusUpdateDto) =>
    api.put<Transfer>(`/transfers/${id}/status`, data),
  delete: (id: string) => api.delete(`/transfers/${id}`),
};

export default transferService;
