import api from '@/lib/api';
import { Location } from '@/types';

const LIST_LIMIT = 2000;

export interface ConsumableLocationCreateDto {
  name: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
  type?: 'DIRECTORATE' | 'DISTRICT_LAB' | 'DISTRICT_OFFICE';
  parentLocationId?: string;
  labCode?: string;
  isActive?: boolean;
  capabilities?: {
    moveables?: boolean;
    consumables?: boolean;
    chemicals?: boolean;
  };
}

export type ConsumableLocationUpdateDto = Partial<ConsumableLocationCreateDto>;

export interface ConsumableLocationFilters {
  type?: string;
  capability?: 'chemicals' | 'consumables';
  isActive?: boolean;
}

export const consumableLocationService = {
  getAll: (filters?: ConsumableLocationFilters) => {
    const params = new URLSearchParams();
    params.set('limit', String(LIST_LIMIT));
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, String(value));
        }
      });
    }
    const query = `?${params.toString()}`;
    return api.get<Location[]>(`/consumables/locations${query}`);
  },
  getById: (id: string) => api.get<Location>(`/consumables/locations/${id}`),
  create: (data: ConsumableLocationCreateDto) => api.post<Location>('/consumables/locations', data),
  update: (id: string, data: ConsumableLocationUpdateDto) =>
    api.put<Location>(`/consumables/locations/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/locations/${id}`),
};

export default consumableLocationService;
