import api from '@/lib/api';
import { Office, OfficeType } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';
import { fetchAllPages } from '@/services/fetchAllPages';

const LIST_LIMIT = 2000;

export interface OfficeFilters {
  type?: OfficeType;
  capability?: 'chemicals' | 'consumables';
  isActive?: boolean;
  search?: string;
}

export type OfficeListQuery = ListQuery & OfficeFilters;

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

function buildOfficeQuery(query: OfficeListQuery = {}, meta = false) {
  const params = new URLSearchParams();
  const pagination = toListQueryString({ limit: LIST_LIMIT, ...query, meta });
  if (pagination.startsWith('?')) {
    const queryString = new URLSearchParams(pagination.slice(1));
    queryString.forEach((value, key) => params.set(key, value));
  }
  if (query.type) params.set('type', query.type);
  if (query.capability) params.set('capability', query.capability);
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.search?.trim()) params.set('search', query.search.trim());
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const officeService = {
  getAll: (query: OfficeListQuery = {}) =>
    fetchAllPages(
      query,
      (pagedQuery) => api.get<PagedListResponse<Office>>(`/offices${buildOfficeQuery(pagedQuery, true)}`),
      { pageSize: LIST_LIMIT }
    ),
  getPaged: (query: OfficeListQuery = {}) =>
    api.get<PagedListResponse<Office>>(`/offices${buildOfficeQuery(query, true)}`),
  getById: (id: string) => api.get<Office>(`/offices/${id}`),
  create: (data: OfficeCreateDto) => api.post<Office>('/offices', data),
  update: (id: string, data: OfficeUpdateDto) => api.put<Office>(`/offices/${id}`, data),
  delete: (id: string) => api.delete(`/offices/${id}`),
};

export default officeService;
