import api from '@/lib/api';
import { ConsumableLot } from '@/types';

const LIST_LIMIT = 2000;

export interface ConsumableLotFilters {
  consumable_id?: string;
  batch_no?: string;
}

function buildQuery(filters?: ConsumableLotFilters) {
  const params = new URLSearchParams();
  params.set('limit', String(LIST_LIMIT));
  if (!filters) return `?${params.toString()}`;
  if (filters.consumable_id) params.set('consumable_id', filters.consumable_id);
  if (filters.batch_no) params.set('batch_no', filters.batch_no);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const consumableLotService = {
  getAll: (filters?: ConsumableLotFilters) =>
    api.get<ConsumableLot[]>(`/consumables/lots${buildQuery(filters)}`),
  getById: (id: string) => api.get<ConsumableLot>(`/consumables/lots/${id}`),
};

export default consumableLotService;
