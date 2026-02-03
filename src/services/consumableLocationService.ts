import api from '@/lib/api';
import { Location } from '@/types';

export interface ConsumableLocationCreateDto {
  name: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
  type?: 'CENTRAL' | 'LAB' | 'SUBSTORE';
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
    const query = filters
      ? `?${new URLSearchParams(
          Object.entries(filters).reduce<Record<string, string>>((acc, [key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              acc[key] = String(value);
            }
            return acc;
          }, {})
        ).toString()}`
      : '';
    return api.get<Location[]>(`/consumables/locations${query}`);
  },
  getById: (id: string) => api.get<Location>(`/consumables/locations/${id}`),
  create: (data: ConsumableLocationCreateDto) => api.post<Location>('/consumables/locations', data),
  update: (id: string, data: ConsumableLocationUpdateDto) =>
    api.put<Location>(`/consumables/locations/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/locations/${id}`),
};

export default consumableLocationService;
