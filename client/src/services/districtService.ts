import api from '@/lib/api';
import { District } from '@/types';

const LIST_LIMIT = 2000;

export interface DistrictCreateDto {
  name: string;
  divisionId?: string | null;
}

export interface DistrictUpdateDto {
  name?: string;
  divisionId?: string | null;
  isActive?: boolean;
}

export const districtService = {
  getAll: (divisionId?: string) =>
    api.get<District[]>(
      divisionId ? `/districts?divisionId=${divisionId}&limit=${LIST_LIMIT}` : `/districts?limit=${LIST_LIMIT}`
    ),

  getById: (id: string) => api.get<District>(`/districts/${id}`),

  create: (data: DistrictCreateDto) =>
    api.post<District>('/districts', {
      name: data.name,
      division_id: data.divisionId || null,
    }),

  update: (id: string, data: DistrictUpdateDto) =>
    api.put<District>(`/districts/${id}`, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.divisionId !== undefined ? { division_id: data.divisionId || null } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    }),

  delete: (id: string) => api.delete(`/districts/${id}`),
};

export default districtService;
