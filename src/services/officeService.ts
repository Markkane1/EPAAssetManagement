import api from '@/lib/api';
import { Office } from '@/types';

export interface OfficeCreateDto {
  name: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
}

export interface OfficeUpdateDto {
  name?: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
}

export const officeService = {
  getAll: () => api.get<Office[]>('/offices'),
  getById: (id: string) => api.get<Office>(`/offices/${id}`),
  create: (data: OfficeCreateDto) => api.post<Office>('/offices', data),
  update: (id: string, data: OfficeUpdateDto) => api.put<Office>(`/offices/${id}`, data),
  delete: (id: string) => api.delete(`/offices/${id}`),
};

export default officeService;
