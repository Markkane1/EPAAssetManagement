import api from '@/lib/api';
import { ConsumableLot } from '@/types';

const LIST_LIMIT = 2000;

export interface ConsumableLotCreateDto {
  consumable_id: string;
  supplier_id?: string;
  batch_no: string;
  received_at: string;
  expiry_date?: string;
  docs?: { sdsUrl?: string; coaUrl?: string; invoiceUrl?: string };
}

export type ConsumableLotUpdateDto = Partial<ConsumableLotCreateDto>;

export interface ConsumableLotFilters {
  consumable_id?: string;
  supplier_id?: string;
  batch_no?: string;
}

function buildQuery(filters?: ConsumableLotFilters) {
  const params = new URLSearchParams();
  params.set('limit', String(LIST_LIMIT));
  if (!filters) return `?${params.toString()}`;
  if (filters.consumable_id) params.set('consumable_id', filters.consumable_id);
  if (filters.supplier_id) params.set('supplier_id', filters.supplier_id);
  if (filters.batch_no) params.set('batch_no', filters.batch_no);
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
