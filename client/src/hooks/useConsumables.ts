import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { consumableService } from "@/services/consumableService";
import type { ConsumableCreateDto, ConsumableUpdateDto } from "@/services/consumableService";
import { toast } from "sonner";
import { refreshActiveQueries } from "@/lib/queryRefresh";

const queryKey = ["consumables"];

export const useConsumables = () => {
  return useQuery({
    queryKey,
    queryFn: consumableService.getAll,
    staleTime: 30000,
  });
};

export const useCreateConsumable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConsumableCreateDto) => consumableService.create(data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKey]);
      toast.success("Consumable created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create consumable: ${error.message}`);
    },
  });
};

export const useUpdateConsumable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConsumableUpdateDto }) =>
      consumableService.update(id, data),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKey]);
      toast.success("Consumable updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update consumable: ${error.message}`);
    },
  });
};

export const useDeleteConsumable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => consumableService.delete(id),
    onSuccess: async () => {
      await refreshActiveQueries(queryClient, [queryKey]);
      toast.success("Consumable deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete consumable: ${error.message}`);
    },
  });
};
