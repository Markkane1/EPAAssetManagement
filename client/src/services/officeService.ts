import api from '@/lib/api';
import { Office, OfficeType } from '@/types';

const LIST_LIMIT = 2000;

export interface OfficeCreateDto {
  name: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
  type?: OfficeType;
  capabilities?: {
    moveables?: boolean;
    consumables?: boolean;
    chemicals?: boolean;
  };
  isHeadoffice?: boolean;
}

export interface OfficeUpdateDto {
  name?: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
  type?: OfficeType;
  capabilities?: {
    moveables?: boolean;
    consumables?: boolean;
    chemicals?: boolean;
  };
  isHeadoffice?: boolean;
}

export const officeService = {
  getAll: () => api.get<Office[]>(`/offices?limit=${LIST_LIMIT}`),
  getById: (id: string) => api.get<Office>(`/offices/${id}`),
  create: (data: OfficeCreateDto) => api.post<Office>('/offices', data),
  update: (id: string, data: OfficeUpdateDto) => api.put<Office>(`/offices/${id}`, data),
  delete: (id: string) => api.delete(`/offices/${id}`),
};

export default officeService;
