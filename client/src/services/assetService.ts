import api from '@/lib/api';
import { Asset } from '@/types';

const LIST_LIMIT = 2000;

export interface AssetCreateDto {
  name: string;
  description?: string;
  specification?: string;
  categoryId: string;
  vendorId?: string;
  unitPrice?: number;
  price?: number;
  quantity?: number;
  projectId?: string;
  assetSource?: 'procurement' | 'project';
  schemeId?: string;
  acquisitionDate?: string;
  dimensions?: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    unit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  };
  attachmentFile?: File | null;
  isActive?: boolean;
}

export interface AssetUpdateDto {
  name?: string;
  description?: string;
  specification?: string;
  categoryId?: string;
  vendorId?: string;
  unitPrice?: number;
  price?: number;
  quantity?: number;
  projectId?: string;
  assetSource?: 'procurement' | 'project';
  schemeId?: string;
  acquisitionDate?: string;
  dimensions?: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    unit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  };
  attachmentFile?: File | null;
  isActive?: boolean;
}

function normalizeDimensions(
  dimensions?: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    unit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  }
) {
  if (!dimensions) return undefined;
  const unit = dimensions.unit || 'cm';
  return {
    length: dimensions.length ?? null,
    width: dimensions.width ?? null,
    height: dimensions.height ?? null,
    unit,
  };
}

function appendIfDefined(form: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  form.append(key, String(value));
}

function toAssetFormData(data: AssetCreateDto | AssetUpdateDto) {
  const normalized = {
    ...data,
    unitPrice: data.unitPrice ?? data.price,
    vendorId: data.vendorId === '' ? undefined : data.vendorId,
    projectId: data.projectId === '' ? undefined : data.projectId,
    schemeId: data.schemeId === '' ? undefined : data.schemeId,
    acquisitionDate: data.acquisitionDate === '' ? undefined : data.acquisitionDate,
    specification: data.specification?.trim() || undefined,
    dimensions: normalizeDimensions(data.dimensions),
  };

  const form = new FormData();

  appendIfDefined(form, 'name', normalized.name);
  appendIfDefined(form, 'description', normalized.description);
  appendIfDefined(form, 'specification', normalized.specification);
  appendIfDefined(form, 'categoryId', normalized.categoryId);
  appendIfDefined(form, 'vendorId', normalized.vendorId);
  appendIfDefined(form, 'projectId', normalized.projectId);
  appendIfDefined(form, 'schemeId', normalized.schemeId);
  appendIfDefined(form, 'assetSource', normalized.assetSource);
  appendIfDefined(form, 'unitPrice', normalized.unitPrice);
  appendIfDefined(form, 'quantity', normalized.quantity);
  appendIfDefined(form, 'acquisitionDate', normalized.acquisitionDate);
  appendIfDefined(form, 'isActive', normalized.isActive);

  if (normalized.dimensions) {
    form.append('dimensionLength', normalized.dimensions.length == null ? '' : String(normalized.dimensions.length));
    form.append('dimensionWidth', normalized.dimensions.width == null ? '' : String(normalized.dimensions.width));
    form.append('dimensionHeight', normalized.dimensions.height == null ? '' : String(normalized.dimensions.height));
    form.append('dimensionUnit', normalized.dimensions.unit || 'cm');
  }

  if (normalized.attachmentFile) {
    form.append('assetAttachment', normalized.attachmentFile);
  }

  return form;
}

export const assetService = {
  getAll: () => api.get<Asset[]>(`/assets?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<Asset>(`/assets/${id}`),

  getByCategory: (categoryId: string) => api.get<Asset[]>(`/assets/category/${categoryId}?limit=${LIST_LIMIT}`),

  getByVendor: (vendorId: string) => api.get<Asset[]>(`/assets/vendor/${vendorId}?limit=${LIST_LIMIT}`),
  
  create: (data: AssetCreateDto) =>
    api.upload<Asset>('/assets', toAssetFormData(data)),
  
  update: (id: string, data: AssetUpdateDto) =>
    api.upload<Asset>(`/assets/${id}`, toAssetFormData(data), 'PUT'),
  
  delete: (id: string) => api.delete(`/assets/${id}`),
};

export default assetService;

