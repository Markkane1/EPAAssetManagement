import api from "@/lib/api";
import { ConsumableAsset } from "@/types";

export interface ConsumableCreateDto {
  name: string;
  description?: string;
  categoryId?: string;
  unit: string;
  totalQuantity: number;
  availableQuantity?: number;
  acquisitionDate: string;
  isActive?: boolean;
}

export interface ConsumableUpdateDto {
  name?: string;
  description?: string;
  categoryId?: string;
  unit?: string;
  totalQuantity?: number;
  availableQuantity?: number;
  acquisitionDate?: string;
  isActive?: boolean;
}

export const consumableService = {
  getAll: () => api.get<ConsumableAsset[]>("/consumables"),
  getById: (id: string) => api.get<ConsumableAsset>(`/consumables/${id}`),
  create: (data: ConsumableCreateDto) => api.post<ConsumableAsset>("/consumables", data),
  update: (id: string, data: ConsumableUpdateDto) => api.put<ConsumableAsset>(`/consumables/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/${id}`),
};

export default consumableService;
