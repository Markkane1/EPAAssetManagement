import api from '@/lib/api';
import type { ConsumableUnit } from '@/types';

export interface ConsumableUnitCreateDto {
  code: string;
  name: string;
  group: 'mass' | 'volume' | 'count';
  toBase: number;
  aliases?: string[];
  isActive?: boolean;
}

export type ConsumableUnitUpdateDto = Partial<ConsumableUnitCreateDto>;

export const consumableUnitService = {
  getAll: (activeOnly = false) =>
    api.get<ConsumableUnit[]>(`/consumables/units${activeOnly ? '?active=true' : ''}`),
  getById: (id: string) => api.get<ConsumableUnit>(`/consumables/units/${id}`),
  create: (data: ConsumableUnitCreateDto) => api.post<ConsumableUnit>('/consumables/units', data),
  update: (id: string, data: ConsumableUnitUpdateDto) =>
    api.put<ConsumableUnit>(`/consumables/units/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/units/${id}`),
};

export default consumableUnitService;
