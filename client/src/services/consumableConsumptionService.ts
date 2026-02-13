import api from "@/lib/api";

export interface ConsumableConsumptionLog {
  id: string;
  consumable_id: string;
  location_id: string;
  available_quantity: number;
  consumed_quantity: number;
  remaining_quantity: number;
  consumed_at: string;
  created_at: string;
}

export const consumableConsumptionService = {
  getAll: (locationId?: string) => {
    const query = locationId ? `?locationId=${locationId}` : "";
    return api.get<ConsumableConsumptionLog[]>(`/consumable-consumptions${query}`);
  },
  consume: (data: { consumableId: string; locationId: string }) =>
    api.post<ConsumableConsumptionLog>("/consumable-consumptions", data),
};
