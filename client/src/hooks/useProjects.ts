import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/services/projectService';
import type { ProjectCreateDto, ProjectUpdateDto } from '@/services/projectService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useProjects = () => {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: projectService.getAll,
    staleTime: query.staleTime,
  });
};

export const useProject = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.projects, id],
    queryFn: () => projectService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useActiveProjects = () => {
  return useQuery({
    queryKey: [...queryKeys.projects, 'active'],
    queryFn: projectService.getActive,
    staleTime: query.staleTime,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: ProjectCreateDto) => projectService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success(messages.projectDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.projectError}: ${error.message}`);
    },
  });
};

