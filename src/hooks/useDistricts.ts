import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { districtService } from '@/services/districtService';
import type { DistrictCreateDto, DistrictUpdateDto } from '@/services/districtService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useDistricts = (divisionId?: string, enabled = true) => {
  return useQuery({
    queryKey: divisionId ? [...queryKeys.districts, divisionId] : queryKeys.districts,
    queryFn: () => districtService.getAll(divisionId),
    staleTime: query.staleTime,
    enabled,
  });
};

export const useDistrict = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.districts, id],
    queryFn: () => districtService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useCreateDistrict = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DistrictCreateDto) => districtService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.districts });
      toast.success(messages.districtCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.districtError}: ${error.message}`);
    },
  });
};

export const useUpdateDistrict = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DistrictUpdateDto }) =>
      districtService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.districts });
      toast.success(messages.districtUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.districtError}: ${error.message}`);
    },
  });
};

export const useDeleteDistrict = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => districtService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.districts });
      toast.success(messages.districtDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.districtError}: ${error.message}`);
    },
  });
};
