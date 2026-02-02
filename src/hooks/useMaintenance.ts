import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService, MaintenanceCreateDto, MaintenanceUpdateDto } from '@/services/maintenanceService';
import { toast } from 'sonner';


export const useMaintenance = () => {
  return useQuery({
    queryKey: ['maintenance'],
    queryFn: maintenanceService.getAll,
    staleTime: 30000,
  });
};

export const useMaintenanceRecord = (id: string) => {
  return useQuery({
    queryKey: ['maintenance', id],
    queryFn: () => maintenanceService.getById(id),
    enabled: !!id,
  });
};

export const useMaintenanceByAssetItem = (assetItemId: string) => {
  return useQuery({
    queryKey: ['maintenance', 'byAssetItem', assetItemId],
    queryFn: () => maintenanceService.getByAssetItem(assetItemId),
    enabled: !!assetItemId,
  });
};

export const useScheduledMaintenance = () => {
  return useQuery({
    queryKey: ['maintenance', 'scheduled'],
    queryFn: async () => {
      const all = await maintenanceService.getAll();
      return all.filter(m => m.maintenance_status === 'Scheduled');
    },
  });
};

export const useCreateMaintenance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: MaintenanceCreateDto) => maintenanceService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success('Maintenance record created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create maintenance record: ${error.message}`);
    },
  });
};

export const useUpdateMaintenance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MaintenanceUpdateDto }) =>
      maintenanceService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success('Maintenance record updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update maintenance record: ${error.message}`);
    },
  });
};

export const useCompleteMaintenance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, completedDate }: { id: string; completedDate: string; notes?: string }) =>
      maintenanceService.complete(id, completedDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success('Maintenance completed successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to complete maintenance: ${error.message}`);
    },
  });
};

export const useDeleteMaintenance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => maintenanceService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      toast.success('Maintenance record deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete maintenance record: ${error.message}`);
    },
  });
};

