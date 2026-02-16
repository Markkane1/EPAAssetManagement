import api from '@/lib/api';
import { Scheme } from '@/types';

const LIST_LIMIT = 1000;

export interface SchemeCreateDto {
  name: string;
  projectId: string;
  description?: string;
  isActive?: boolean;
}

export interface SchemeUpdateDto {
  name?: string;
  projectId?: string;
  description?: string;
  isActive?: boolean;
}

export const schemeService = {
  getAll: () => api.get<Scheme[]>(`/schemes?limit=${LIST_LIMIT}`),

  getById: (id: string) => api.get<Scheme>(`/schemes/${id}`),

  getByProject: (projectId: string) => api.get<Scheme[]>(`/schemes/project/${projectId}?limit=${LIST_LIMIT}`),

  create: (data: SchemeCreateDto) => api.post<Scheme>('/schemes', data),

  update: (id: string, data: SchemeUpdateDto) => api.put<Scheme>(`/schemes/${id}`, data),

  delete: (id: string) => api.delete(`/schemes/${id}`),
};

export default schemeService;
