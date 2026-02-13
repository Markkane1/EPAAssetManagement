import api from '@/lib/api';
import { ConsumableContainer } from '@/types';

const LIST_LIMIT = 2000;

export interface ConsumableContainerCreateDto {
  lotId: string;
  containerCode: string;
  initialQtyBase: number;
  currentQtyBase?: number;
  currentLocationId: string;
  status?: 'IN_STOCK' | 'EMPTY' | 'DISPOSED' | 'LOST';
  openedDate?: string;
}

export type ConsumableContainerUpdateDto = Partial<ConsumableContainerCreateDto>;

export interface ConsumableContainerFilters {
  lotId?: string;
  locationId?: string;
  status?: string;
}

function buildQuery(filters?: ConsumableContainerFilters) {
  const params = new URLSearchParams();
  params.set('limit', String(LIST_LIMIT));
  if (!filters) return `?${params.toString()}`;
  if (filters.lotId) params.set('lotId', filters.lotId);
  if (filters.locationId) params.set('locationId', filters.locationId);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const consumableContainerService = {
  getAll: (filters?: ConsumableContainerFilters) =>
    api.get<ConsumableContainer[]>(`/consumables/containers${buildQuery(filters)}`),
  getById: (id: string) => api.get<ConsumableContainer>(`/consumables/containers/${id}`),
  create: (data: ConsumableContainerCreateDto) =>
    api.post<ConsumableContainer>('/consumables/containers', data),
  update: (id: string, data: ConsumableContainerUpdateDto) =>
    api.put<ConsumableContainer>(`/consumables/containers/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/containers/${id}`),
};

export default consumableContainerService;
