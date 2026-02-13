import api from '@/lib/api';
import { ConsumableSupplier } from '@/types';

const LIST_LIMIT = 2000;

export interface ConsumableSupplierCreateDto {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export type ConsumableSupplierUpdateDto = Partial<ConsumableSupplierCreateDto>;

export const consumableSupplierService = {
  getAll: () => api.get<ConsumableSupplier[]>(`/consumables/suppliers?limit=${LIST_LIMIT}`),
  getById: (id: string) => api.get<ConsumableSupplier>(`/consumables/suppliers/${id}`),
  create: (data: ConsumableSupplierCreateDto) => api.post<ConsumableSupplier>('/consumables/suppliers', data),
  update: (id: string, data: ConsumableSupplierUpdateDto) =>
    api.put<ConsumableSupplier>(`/consumables/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/suppliers/${id}`),
};

export default consumableSupplierService;
