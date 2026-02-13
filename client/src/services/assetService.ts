import api from '@/lib/api';
import { Asset } from '@/types';

const LIST_LIMIT = 2000;

export interface AssetCreateDto {
  name: string;
  description?: string;
  categoryId: string;
  vendorId?: string;
  unitPrice?: number;
  price?: number;
  quantity?: number;
  projectId?: string;
  assetSource?: 'procurement' | 'project';
  schemeId?: string;
  acquisitionDate?: string;
  isActive?: boolean;
}

export interface AssetUpdateDto {
  name?: string;
  description?: string;
  categoryId?: string;
  vendorId?: string;
  unitPrice?: number;
  price?: number;
  quantity?: number;
  projectId?: string;
  assetSource?: 'procurement' | 'project';
  schemeId?: string;
  acquisitionDate?: string;
  isActive?: boolean;
}

export const assetService = {
  getAll: () => api.get<Asset[]>(`/assets?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<Asset>(`/assets/${id}`),

  getByCategory: (categoryId: string) => api.get<Asset[]>(`/assets/category/${categoryId}?limit=${LIST_LIMIT}`),

  getByVendor: (vendorId: string) => api.get<Asset[]>(`/assets/vendor/${vendorId}?limit=${LIST_LIMIT}`),
  
  create: (data: AssetCreateDto) =>
    api.post<Asset>('/assets', {
      ...data,
      unitPrice: data.unitPrice ?? data.price,
      vendorId: data.vendorId || undefined,
      projectId: data.projectId || undefined,
      schemeId: data.schemeId || undefined,
      acquisitionDate: data.acquisitionDate || undefined,
    }),
  
  update: (id: string, data: AssetUpdateDto) =>
    api.put<Asset>(`/assets/${id}`, {
      ...data,
      unitPrice: data.unitPrice ?? data.price,
      vendorId: data.vendorId === "" ? undefined : data.vendorId,
      projectId: data.projectId === "" ? undefined : data.projectId,
      schemeId: data.schemeId === "" ? undefined : data.schemeId,
      acquisitionDate: data.acquisitionDate === "" ? undefined : data.acquisitionDate,
    }),
  
  delete: (id: string) => api.delete(`/assets/${id}`),
};

export default assetService;

