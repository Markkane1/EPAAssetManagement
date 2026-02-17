import api from '@/lib/api';

export interface OfficeSubLocation {
  id: string;
  _id?: string;
  office_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfficeSubLocationCreateDto {
  office_id: string;
  name: string;
}

export interface OfficeSubLocationUpdateDto {
  name?: string;
  is_active?: boolean;
}

function toQueryString(params?: Record<string, unknown>) {
  if (!params) return '';
  const query = Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = String(value);
    }
    return acc;
  }, {});
  const encoded = new URLSearchParams(query).toString();
  return encoded ? `?${encoded}` : '';
}

export const officeSubLocationService = {
  list: (params?: { officeId?: string; includeInactive?: boolean }) =>
    api.get<OfficeSubLocation[]>(`/office-sub-locations${toQueryString(params)}`),
  create: (data: OfficeSubLocationCreateDto) => api.post<OfficeSubLocation>('/office-sub-locations', data),
  update: (id: string, data: OfficeSubLocationUpdateDto) =>
    api.put<OfficeSubLocation>(`/office-sub-locations/${id}`, data),
  delete: (id: string) => api.delete<OfficeSubLocation>(`/office-sub-locations/${id}`),
};

export default officeSubLocationService;
