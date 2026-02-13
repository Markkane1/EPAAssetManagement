import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schemeService } from '@/services/schemeService';
import type { SchemeCreateDto, SchemeUpdateDto } from '@/services/schemeService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, query } = API_CONFIG;

export const useSchemes = () => {
  return useQuery({
    queryKey: queryKeys.schemes,
    queryFn: schemeService.getAll,
    staleTime: query.staleTime,
  });
};

export const useScheme = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.schemes, id],
    queryFn: () => schemeService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useSchemesByProject = (projectId: string) => {
  return useQuery({
    queryKey: [...queryKeys.schemes, 'byProject', projectId],
    queryFn: () => schemeService.getByProject(projectId),
    enabled: !!projectId,
    staleTime: query.staleTime,
  });
};

export const useCreateScheme = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SchemeCreateDto) => schemeService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes });
      toast.success('Scheme created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create scheme: ${error.message}`);
    },
  });
};

export const useUpdateScheme = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SchemeUpdateDto }) => schemeService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes });
      toast.success('Scheme updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update scheme: ${error.message}`);
    },
  });
};

export const useDeleteScheme = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => schemeService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes });
      toast.success('Scheme deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete scheme: ${error.message}`);
    },
  });
};
