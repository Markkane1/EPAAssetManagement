import api from '@/lib/api';
import { Office, OfficeType } from '@/types';

const LIST_LIMIT = 2000;

export interface OfficeFilters {
  type?: OfficeType;
  capability?: 'chemicals' | 'consumables';
  isActive?: boolean;
  search?: string;
}

export interface OfficeCreateDto {
  name: string;
  division: string;
  district: string;
  address: string;
  contactNumber: string;
  type: OfficeType;
  parentOfficeId?: string;
  isActive?: boolean;
  capabilities?: {
    moveables?: boolean;
    consumables?: boolean;
    chemicals?: boolean;
  };
}

export interface OfficeUpdateDto {
  name?: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
  type?: OfficeType;
  parentOfficeId?: string;
  isActive?: boolean;
  capabilities?: {
    moveables?: boolean;
    consumables?: boolean;
    chemicals?: boolean;
  };
}

export const officeService = {
  getAll: (filters?: OfficeFilters) => {
    const params = new URLSearchParams();
    params.set('limit', String(LIST_LIMIT));
    if (filters) {
      if (filters.type) params.set('type', filters.type);
      if (filters.capability) params.set('capability', filters.capability);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.search?.trim()) params.set('search', filters.search.trim());
    }
    return api.get<Office[]>(`/offices?${params.toString()}`);
  },
  getById: (id: string) => api.get<Office>(`/offices/${id}`),
  create: (data: OfficeCreateDto) => api.post<Office>('/offices', data),
  update: (id: string, data: OfficeUpdateDto) => api.put<Office>(`/offices/${id}`, data),
  delete: (id: string) => api.delete(`/offices/${id}`),
};

export default officeService;
