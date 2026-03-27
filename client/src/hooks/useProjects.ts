import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/services/projectService';
import type { ProjectCreateDto, ProjectListQuery, ProjectUpdateDto } from '@/services/projectService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

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
    onSuccess: (project) => {
      if (project?.id) {
        queryClient.setQueryData(projectKeys.detail(project.id), project);
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'active'] });
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
    onSuccess: (project, variables) => {
      queryClient.setQueryData(projectKeys.detail(variables.id), project);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'active'] });
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
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id), exact: true });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects, 'active'] });
      toast.success(messages.projectDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.projectError}: ${error.message}`);
    },
  });
};

