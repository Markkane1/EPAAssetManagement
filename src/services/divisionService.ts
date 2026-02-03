import api from '@/lib/api';
import { Division } from '@/types';

export interface DivisionCreateDto {
  name: string;
}

export interface DivisionUpdateDto {
  name?: string;
  isActive?: boolean;
}

export const divisionService = {
  getAll: () => api.get<Division[]>('/divisions'),

  getById: (id: string) => api.get<Division>(`/divisions/${id}`),

  create: (data: DivisionCreateDto) => api.post<Division>('/divisions', data),

  update: (id: string, data: DivisionUpdateDto) =>
    api.put<Division>(`/divisions/${id}`, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    }),

  delete: (id: string) => api.delete(`/divisions/${id}`),
};

export default divisionService;
