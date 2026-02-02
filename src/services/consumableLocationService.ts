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
}

export type ConsumableLocationUpdateDto = Partial<ConsumableLocationCreateDto>;

export const consumableLocationService = {
  getAll: (type?: string) =>
    api.get<Location[]>(`/consumables/locations${type ? `?type=${type}` : ''}`),
  getById: (id: string) => api.get<Location>(`/consumables/locations/${id}`),
  create: (data: ConsumableLocationCreateDto) => api.post<Location>('/consumables/locations', data),
  update: (id: string, data: ConsumableLocationUpdateDto) =>
    api.put<Location>(`/consumables/locations/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/locations/${id}`),
};

export default consumableLocationService;
