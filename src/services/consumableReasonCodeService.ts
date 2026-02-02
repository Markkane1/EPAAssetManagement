import api from '@/lib/api';
import { ConsumableReasonCode } from '@/types';

export interface ReasonCodeFilters {
  category?: 'ADJUST' | 'DISPOSE';
}

function buildQuery(filters?: ReasonCodeFilters) {
  if (!filters || !filters.category) return '';
  const params = new URLSearchParams();
  params.set('category', filters.category);
  return `?${params.toString()}`;
}

export const consumableReasonCodeService = {
  getAll: (filters?: ReasonCodeFilters) =>
    api.get<ConsumableReasonCode[]>(`/consumables/reason-codes${buildQuery(filters)}`),
  create: (data: { category: 'ADJUST' | 'DISPOSE'; code: string; description?: string }) =>
    api.post<ConsumableReasonCode>('/consumables/reason-codes', data),
};

export default consumableReasonCodeService;
