import api from "@/lib/api";
import { ConsumableAssignment, ConsumableAssigneeType } from "@/types";

const LIST_LIMIT = 2000;

export interface ConsumableAssignmentCreateDto {
  consumableId: string;
  assigneeType: ConsumableAssigneeType;
  assigneeId: string;
  receivedByEmployeeId?: string | null;
  quantity: number;
  inputQuantity?: number;
  inputUnit?: string;
  assignedDate: string;
  notes?: string;
}

export interface ConsumableTransferItemDto {
  consumableId: string;
  quantity: number;
  inputQuantity?: number;
  inputUnit?: string;
}

export interface ConsumableTransferBatchDto {
  fromLocationId: string;
  toLocationId: string;
  assignedDate: string;
  notes?: string;
  receivedByEmployeeId: string;
  items: ConsumableTransferItemDto[];
}

export const consumableAssignmentService = {
  getAll: (consumableId?: string) =>
    api.get<ConsumableAssignment[]>(
      consumableId
        ? `/consumable-assignments?consumableId=${consumableId}&limit=${LIST_LIMIT}`
        : `/consumable-assignments?limit=${LIST_LIMIT}`
    ),
  create: (data: ConsumableAssignmentCreateDto) =>
    api.post<ConsumableAssignment>("/consumable-assignments", data),
  transferBatch: (data: ConsumableTransferBatchDto) =>
    api.post<ConsumableAssignment[]>("/consumable-assignments/transfer-batch", data),
  delete: (id: string) => api.delete(`/consumable-assignments/${id}`),
};

export default consumableAssignmentService;
