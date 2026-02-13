import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { consumableAssignmentService } from "@/services/consumableAssignmentService";
import type { ConsumableAssignmentCreateDto, ConsumableTransferBatchDto } from "@/services/consumableAssignmentService";
import { toast } from "sonner";

const queryKey = ["consumable-assignments"];

export const useConsumableAssignments = (consumableId?: string) => {
  return useQuery({
    queryKey: consumableId ? [...queryKey, consumableId] : queryKey,
    queryFn: () => consumableAssignmentService.getAll(consumableId),
    staleTime: 30000,
  });
};

export const useCreateConsumableAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConsumableAssignmentCreateDto) =>
      consumableAssignmentService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumables"] });
      queryClient.invalidateQueries({ queryKey });
      toast.success("Consumable assigned successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign consumable: ${error.message}`);
    },
  });
};

export const useDeleteConsumableAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => consumableAssignmentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumables"] });
      queryClient.invalidateQueries({ queryKey });
      toast.success("Consumable assignment removed");
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove assignment: ${error.message}`);
    },
  });
};

export const useTransferConsumableBatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConsumableTransferBatchDto) =>
      consumableAssignmentService.transferBatch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumables"] });
      queryClient.invalidateQueries({ queryKey });
      toast.success("Consumable transfer completed");
    },
    onError: (error: Error) => {
      toast.error(`Failed to transfer consumables: ${error.message}`);
    },
  });
};
