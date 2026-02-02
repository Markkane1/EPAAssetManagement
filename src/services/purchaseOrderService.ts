import api from '@/lib/api';
import { PurchaseOrder, PurchaseOrderStatus } from '@/types';

export interface PurchaseOrderCreateDto {
  orderNumber?: string;
  vendorId: string;
  projectId?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  totalAmount: number;
  notes?: string;
}

export interface PurchaseOrderUpdateDto {
  orderNumber?: string;
  vendorId?: string;
  projectId?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  deliveredDate?: string;
  status?: PurchaseOrderStatus;
  totalAmount?: number;
  notes?: string;
}

export const purchaseOrderService = {
  getAll: () => api.get<PurchaseOrder[]>('/purchase-orders'),
  
  getById: (id: string) => api.get<PurchaseOrder>(`/purchase-orders/${id}`),
  
  getByVendor: (vendorId: string) => api.get<PurchaseOrder[]>(`/purchase-orders/vendor/${vendorId}`),
  
  getByProject: (projectId: string) => api.get<PurchaseOrder[]>(`/purchase-orders/project/${projectId}`),

  getPending: () => api.get<PurchaseOrder[]>('/purchase-orders/pending'),
  
  create: (data: PurchaseOrderCreateDto) => api.post<PurchaseOrder>('/purchase-orders', data),
  
  update: (id: string, data: PurchaseOrderUpdateDto) => api.put<PurchaseOrder>(`/purchase-orders/${id}`, data),
  
  delete: (id: string) => api.delete(`/purchase-orders/${id}`),
};

export default purchaseOrderService;

