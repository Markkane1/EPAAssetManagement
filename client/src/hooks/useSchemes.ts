import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schemeService } from '@/services/schemeService';
import type { SchemeCreateDto, SchemeUpdateDto } from '@/services/schemeService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import type { Scheme } from '@/types';
import {
  refreshActiveQueries,
  removeEntityFromQueryCaches,
  syncEntityInQueryCaches,
} from '@/lib/queryRefresh';

const { queryKeys, query } = API_CONFIG;

function sortSchemes(items: Scheme[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function syncSchemeCaches(queryClient: ReturnType<typeof useQueryClient>, scheme: Scheme) {
  syncEntityInQueryCaches(queryClient, {
    queryKey: queryKeys.schemes,
    entity: scheme,
    matchesQuery: (queryKey, entity) => {
      if (queryKey[1] === 'byProject') {
        return String(entity.project_id || '') === String(queryKey[2] || '');
      }
      return true;
    },
    sortItems: sortSchemes,
  });
}

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
    onSuccess: async (scheme) => {
      if (scheme?.id) {
        queryClient.setQueryData([...queryKeys.schemes, scheme.id], scheme);
        syncSchemeCaches(queryClient, scheme);
      }
      await refreshActiveQueries(queryClient, [queryKeys.schemes]);
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
    onSuccess: async (scheme, variables) => {
      queryClient.setQueryData([...queryKeys.schemes, variables.id], scheme);
      syncSchemeCaches(queryClient, scheme);
      await refreshActiveQueries(queryClient, [queryKeys.schemes]);
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
    onSuccess: async (_data, id) => {
      queryClient.removeQueries({ queryKey: [...queryKeys.schemes, id], exact: true });
      removeEntityFromQueryCaches(queryClient, queryKeys.schemes, id);
      await refreshActiveQueries(queryClient, [queryKeys.schemes]);
      toast.success('Scheme deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete scheme: ${error.message}`);
    },
  });
};
