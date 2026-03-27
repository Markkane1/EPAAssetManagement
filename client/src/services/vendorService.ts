import api from '@/lib/api';
import { Vendor } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';

const LIST_LIMIT = 1000;

export interface VendorListQuery extends ListQuery {
  officeId?: string;
  search?: string;
}

export interface VendorCreateDto {
  name: string;
  contactInfo: string;
  email: string;
  phone: string;
  address: string;
  officeId?: string;
}

export interface VendorUpdateDto {
  name?: string;
  contactInfo?: string;
  email?: string;
  phone?: string;
  address?: string;
  officeId?: string;
}

function buildVendorQuery(query: VendorListQuery = {}, meta = false) {
  const params = new URLSearchParams();
  const pagination = toListQueryString({ limit: LIST_LIMIT, ...query, meta });
  if (pagination.startsWith('?')) {
    const queryString = new URLSearchParams(pagination.slice(1));
    queryString.forEach((value, key) => params.set(key, value));
  }
  const officeId = String(query.officeId || '').trim();
  if (officeId) params.set('officeId', officeId);
  if (query.search?.trim()) params.set('search', query.search.trim());
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const vendorService = {
  getAll: (query: VendorListQuery = {}) => api.get<Vendor[]>(`/vendors${buildVendorQuery(query)}`),

  getPaged: (query: VendorListQuery = {}) =>
    api.get<PagedListResponse<Vendor>>(`/vendors${buildVendorQuery(query, true)}`),
  
  getById: (id: string) => api.get<Vendor>(`/vendors/${id}`),
  
  create: (data: VendorCreateDto) => api.post<Vendor>('/vendors', data),
  
  update: (id: string, data: VendorUpdateDto) => api.put<Vendor>(`/vendors/${id}`, data),
  
  delete: (id: string) => api.delete(`/vendors/${id}`),
};

export default vendorService;

