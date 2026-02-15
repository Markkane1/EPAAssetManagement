import api from '@/lib/api';
import { Transfer } from '@/types';

export type TransferStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISPATCHED_TO_STORE'
  | 'RECEIVED_AT_STORE'
  | 'DISPATCHED_TO_DEST'
  | 'RECEIVED_AT_DEST'
  | 'REJECTED'
  | 'CANCELLED';

export interface TransferLineCreateDto {
  assetItemId: string;
  notes?: string;
}

export interface TransferCreateDto {
  fromOfficeId: string;
  toOfficeId: string;
  lines: TransferLineCreateDto[];
  notes?: string;
  requisitionId?: string;
}

const LIST_LIMIT = 1000;

export const transferService = {
  getAll: () => api.get<Transfer[]>(`/transfers?limit=${LIST_LIMIT}`),
  getByAssetItem: (assetItemId: string) =>
    api.get<Transfer[]>(`/transfers/asset-item/${assetItemId}?limit=${LIST_LIMIT}`),
  getByOffice: (officeId: string) =>
    api.get<Transfer[]>(`/transfers/office/${officeId}?limit=${LIST_LIMIT}`),
  create: (data: TransferCreateDto) => api.post<Transfer>('/transfers', data),
  approve: (id: string) => api.post<Transfer>(`/transfers/${id}/approve`, {}),
  dispatchToStore: (id: string, handoverDocumentId: string) =>
    api.post<Transfer>(`/transfers/${id}/dispatch-to-store`, { handoverDocumentId }),
  receiveAtStore: (id: string) => api.post<Transfer>(`/transfers/${id}/receive-at-store`, {}),
  dispatchToDest: (id: string) => api.post<Transfer>(`/transfers/${id}/dispatch-to-dest`, {}),
  receiveAtDest: (id: string, takeoverDocumentId: string) =>
    api.post<Transfer>(`/transfers/${id}/receive-at-dest`, { takeoverDocumentId }),
  reject: (id: string) => api.post<Transfer>(`/transfers/${id}/reject`, {}),
  cancel: (id: string) => api.post<Transfer>(`/transfers/${id}/cancel`, {}),
  delete: (id: string) => api.delete(`/transfers/${id}`),
};

export default transferService;
