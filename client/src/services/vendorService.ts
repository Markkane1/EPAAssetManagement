import api from '@/lib/api';
import { Vendor } from '@/types';

const LIST_LIMIT = 1000;

export interface VendorCreateDto {
  name: string;
  contactInfo: string;
  email: string;
  phone: string;
  address: string;
}

export interface VendorUpdateDto {
  name?: string;
  contactInfo?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export const vendorService = {
  getAll: () => api.get<Vendor[]>(`/vendors?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<Vendor>(`/vendors/${id}`),
  
  create: (data: VendorCreateDto) => api.post<Vendor>('/vendors', data),
  
  update: (id: string, data: VendorUpdateDto) => api.put<Vendor>(`/vendors/${id}`, data),
  
  delete: (id: string) => api.delete(`/vendors/${id}`),
};

export default vendorService;

