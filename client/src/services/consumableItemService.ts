import api from '@/lib/api';
import { ConsumableItem, ConsumableBaseUom } from '@/types';

const LIST_LIMIT = 2000;

export interface ConsumableItemCreateDto {
  name: string;
  casNumber?: string;
  categoryId?: string;
  baseUom: ConsumableBaseUom;
  isHazardous?: boolean;
  isControlled?: boolean;
  isChemical?: boolean;
  requiresLotTracking?: boolean;
  requiresContainerTracking?: boolean;
  defaultMinStock?: number;
  defaultReorderPoint?: number;
  storageCondition?: string;
}

export type ConsumableItemUpdateDto = Partial<ConsumableItemCreateDto>;

export const consumableItemService = {
  getAll: () => api.get<ConsumableItem[]>(`/consumables/items?limit=${LIST_LIMIT}`),
  getById: (id: string) => api.get<ConsumableItem>(`/consumables/items/${id}`),
  create: (data: ConsumableItemCreateDto) => api.post<ConsumableItem>('/consumables/items', data),
  update: (id: string, data: ConsumableItemUpdateDto) =>
    api.put<ConsumableItem>(`/consumables/items/${id}`, data),
  delete: (id: string) => api.delete(`/consumables/items/${id}`),
};

export default consumableItemService;
