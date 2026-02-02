import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryService } from '@/services/categoryService';
import type { CategoryCreateDto, CategoryUpdateDto } from '@/services/categoryService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;

export const useCategories = () => {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoryService.getAll,
    staleTime: query.staleTime,
  });
};

export const useCategory = (id: string) => {
  return useQuery({
    queryKey: [...queryKeys.categories, id],
    queryFn: () => categoryService.getById(id),
    enabled: !!id,
    staleTime: query.staleTime,
  });
};

export const useCreateCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CategoryCreateDto) => categoryService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      toast.success(messages.categoryCreated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.categoryError}: ${error.message}`);
    },
  });
};

export const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoryUpdateDto }) =>
      categoryService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      toast.success(messages.categoryUpdated);
    },
    onError: (error: Error) => {
      toast.error(`${messages.categoryError}: ${error.message}`);
    },
  });
};

export const useDeleteCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => categoryService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      toast.success(messages.categoryDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.categoryError}: ${error.message}`);
    },
  });
};

