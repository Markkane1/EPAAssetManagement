import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { officeSubLocationService } from '@/services/officeSubLocationService';

const queryKey = ['officeSubLocations'] as const;

export const useOfficeSubLocations = (params?: { officeId?: string; includeInactive?: boolean }) =>
  useQuery({
    queryKey: [...queryKey, params || {}],
    queryFn: () => officeSubLocationService.list(params),
  });

export const useCreateOfficeSubLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: officeSubLocationService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Section created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to process section: ${error.message}`);
    },
  });
};

export const useUpdateOfficeSubLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; is_active?: boolean } }) =>
      officeSubLocationService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Section updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to process section: ${error.message}`);
    },
  });
};

export const useDeleteOfficeSubLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => officeSubLocationService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Section deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to process section: ${error.message}`);
    },
  });
};

