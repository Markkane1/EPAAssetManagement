import api from '@/lib/api';
import { ConsumableLot } from '@/types';

const LIST_LIMIT = 2000;

export interface ConsumableLotCreateDto {
  itemId: string;
  supplierId?: string;
  lotNumber: string;
  receivedDate: string;
  expiryDate?: string;
  docs?: { sdsUrl?: string; coaUrl?: string; invoiceUrl?: string };
}

export type ConsumableLotUpdateDto = Partial<ConsumableLotCreateDto>;

export interface ConsumableLotFilters {
  itemId?: string;
  supplierId?: string;
  lotNumber?: string;
}

function buildQuery(filters?: ConsumableLotFilters) {
  const params = new URLSearchParams();
  params.set('limit', String(LIST_LIMIT));
  if (!filters) return `?${params.toString()}`;
  if (filters.itemId) params.set('itemId', filters.itemId);
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.lotNumber) params.set('lotNumber', filters.lotNumber);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const consumableLotService = {
  getAll: (filters?: ConsumableLotFilters) =>
    api.get<ConsumableLot[]>(`/consumables/lots${buildQuery(filters)}`),
  getById: (id: string) => api.get<ConsumableLot>(`/consumables/lots/${id}`),
  create: (data: ConsumableLotCreateDto) => api.post<ConsumableLot>('/consumables/lots', data),
  update: (id: string, data: ConsumableLotUpdateDto) => api.put<ConsumableLot>(`/consumables/lots/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/lots/${id}`),
};

export default consumableLotService;
