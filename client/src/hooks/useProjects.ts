import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/services/projectService';
import type { ProjectCreateDto, ProjectListQuery, ProjectUpdateDto } from '@/services/projectService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import type { Project } from '@/types';
import {
  refreshActiveQueries,
  removeEntityFromQueryCaches,
  syncEntityInQueryCaches,
} from '@/lib/queryRefresh';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

const projectKeys = {
  list: (filters?: ProjectListQuery) => [...queryKeys.projects, 'list', filters?.search?.trim() ?? ''] as const,
  paged: (filters?: ProjectListQuery) => [
    ...queryKeys.projects,
    'paged',
    filters?.page ?? 1,
    filters?.limit ?? null,
    filters?.search?.trim() ?? '',
  ] as const,
  detail: (id: string) => [...queryKeys.projects, 'detail', id] as const,
  active: (filters?: ProjectListQuery) => [...queryKeys.projects, 'active', filters?.search?.trim() ?? ''] as const,
};

function matchesProjectSearch(project: Project, rawSearch: unknown) {
  const search = String(rawSearch || '').trim().toLowerCase();
  if (!search) return true;
  const haystack = [project.name, project.code, project.description]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return haystack.includes(search);
}

function sortProjects(items: Project[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function syncProjectCaches(queryClient: ReturnType<typeof useQueryClient>, project: Project) {
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.projects, 'list'],
    entity: project,
    matchesQuery: (queryKey, entity) => matchesProjectSearch(entity, queryKey[2]),
    sortItems: sortProjects,
  });
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.projects, 'paged'],
    entity: project,
    matchesQuery: (queryKey, entity) => matchesProjectSearch(entity, queryKey[4]),
    getPageInfo: (queryKey) => ({
      page: Number(queryKey[2] || 1),
      limit: queryKey[3] === null ? null : Number(queryKey[3] || 0) || null,
    }),
    sortItems: sortProjects,
  });
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.projects, 'active'],
    entity: project,
    matchesQuery: (queryKey, entity) => Boolean(entity.is_active) && matchesProjectSearch(entity, queryKey[2]),
    sortItems: sortProjects,
  });
}

export const useProjects = (queryParams: ProjectListQuery = {}) => {
  return useQuery({
    queryKey: projectKeys.list(queryParams),
    queryFn: () => projectService.getAll(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const usePagedProjects = (queryParams: ProjectListQuery = {}) => {
  return useQuery({
    queryKey: projectKeys.paged(queryParams),
    queryFn: () => projectService.getPaged(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useProject = (id: string) => {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projectService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useActiveProjects = (queryParams: ProjectListQuery = {}) => {
  return useQuery({
    queryKey: projectKeys.active(queryParams),
    queryFn: () => projectService.getActive(queryParams),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: ProjectCreateDto) => projectService.create(data),
    onSuccess: async (project) => {
      if (project?.id) {
        queryClient.setQueryData(projectKeys.detail(project.id), project);
        syncProjectCaches(queryClient, project);
      }
      await refreshActiveQueries(queryClient, [
        [...queryKeys.projects, 'list'],
        [...queryKeys.projects, 'paged'],
        [...queryKeys.projects, 'active'],
      ]);
      toast.success(messages.projectCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.projectError}: ${error.message}`);
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectUpdateDto }) =>
      projectService.update(id, data),
    onSuccess: async (project, variables) => {
      queryClient.setQueryData(projectKeys.detail(variables.id), project);
      syncProjectCaches(queryClient, project);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.projects, 'list'],
        [...queryKeys.projects, 'paged'],
        [...queryKeys.projects, 'active'],
      ]);
      toast.success(messages.projectUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.projectError}: ${error.message}`);
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => projectService.delete(id),
    onSuccess: async (_data, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id), exact: true });
      removeEntityFromQueryCaches(queryClient, [...queryKeys.projects, 'list'], id);
      removeEntityFromQueryCaches(queryClient, [...queryKeys.projects, 'paged'], id);
      removeEntityFromQueryCaches(queryClient, [...queryKeys.projects, 'active'], id);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.projects, 'list'],
        [...queryKeys.projects, 'paged'],
        [...queryKeys.projects, 'active'],
      ]);
      toast.success(messages.projectDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.projectError}: ${error.message}`);
    },
  });
};

