import api from '@/lib/api';
import { PurchaseOrder, PurchaseOrderStatus } from '@/types';

const LIST_LIMIT = 2000;

export interface PurchaseOrderCreateDto {
  orderNumber?: string;
  sourceType: 'procurement' | 'project';
  sourceName: string;
  vendorId?: string;
  projectId?: string;
  schemeId?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  unitPrice?: number;
  totalAmount: number;
  taxPercentage?: number;
  taxAmount?: number;
  attachmentFile?: File | null;
  notes?: string;
}

export interface PurchaseOrderUpdateDto {
  orderNumber?: string;
  sourceType?: 'procurement' | 'project';
  sourceName?: string;
  vendorId?: string;
  projectId?: string;
  schemeId?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  deliveredDate?: string;
  unitPrice?: number;
  status?: PurchaseOrderStatus;
  totalAmount?: number;
  taxPercentage?: number;
  taxAmount?: number;
  attachmentFile?: File | null;
  notes?: string;
}

function toPurchaseOrderFormData(data: PurchaseOrderCreateDto | PurchaseOrderUpdateDto) {
  const { attachmentFile, ...payload } = data as (PurchaseOrderCreateDto | PurchaseOrderUpdateDto) & {
    attachmentFile?: File | null;
  };
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  if (attachmentFile) {
    formData.append('purchaseOrderAttachment', attachmentFile);
  }
  return formData;
}

export const purchaseOrderService = {
  getAll: () => api.get<PurchaseOrder[]>(`/purchase-orders?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<PurchaseOrder>(`/purchase-orders/${id}`),
  
  getByVendor: (vendorId: string) => api.get<PurchaseOrder[]>(`/purchase-orders/vendor/${vendorId}?limit=${LIST_LIMIT}`),
  
  getByProject: (projectId: string) => api.get<PurchaseOrder[]>(`/purchase-orders/project/${projectId}?limit=${LIST_LIMIT}`),

  getPending: () => api.get<PurchaseOrder[]>(`/purchase-orders/pending?limit=${LIST_LIMIT}`),
  
  create: (data: PurchaseOrderCreateDto) =>
    api.upload<PurchaseOrder>('/purchase-orders', toPurchaseOrderFormData(data)),
  
  update: (id: string, data: PurchaseOrderUpdateDto) =>
    api.upload<PurchaseOrder>(`/purchase-orders/${id}`, toPurchaseOrderFormData(data), 'PUT'),
  
  delete: (id: string) => api.delete(`/purchase-orders/${id}`),
};

export default purchaseOrderService;

