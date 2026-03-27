import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryService } from '@/services/categoryService';
import type {
  CategoryCountsResponse,
  CategoryCreateDto,
  CategoryListParams,
  CategoryUpdateDto,
} from '@/services/categoryService';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';

const { queryKeys, messages, query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

const categoryKeys = {
  list: (params?: CategoryListParams) => [
    ...queryKeys.categories,
    'list',
    params?.scope || 'ALL_SCOPE',
    params?.assetType || 'ALL_TYPE',
    params?.search?.trim() || '',
  ] as const,
  paged: (params?: CategoryListParams) => [
    ...queryKeys.categories,
    'paged',
    params?.page ?? 1,
    params?.limit ?? null,
    params?.scope || 'ALL_SCOPE',
    params?.assetType || 'ALL_TYPE',
    params?.search?.trim() || '',
  ] as const,
  detail: (id: string) => [...queryKeys.categories, 'detail', id] as const,
  counts: (ids: string[]) => [...queryKeys.categories, 'counts', ...ids] as const,
};

export const useCategories = (params?: CategoryListParams) => {
  return useQuery({
    queryKey: categoryKeys.list(params),
    queryFn: () => categoryService.getAll(params),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const usePagedCategories = (params?: CategoryListParams) => {
  return useQuery({
    queryKey: categoryKeys.paged(params),
    queryFn: () => categoryService.getPaged(params),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
  });
};

export const useCategoryCounts = (ids: string[]) => {
  return useQuery<CategoryCountsResponse>({
    queryKey: categoryKeys.counts(ids),
    queryFn: () => categoryService.getCounts(ids),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled: ids.length > 0,
  });
};

export const useCategory = (id: string) => {
  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: () => categoryService.getById(id),
    enabled: !!id,
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
  });
};

export const useCreateCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CategoryCreateDto) => categoryService.create(data),
    onSuccess: (category) => {
      if (category?.id) {
        queryClient.setQueryData(categoryKeys.detail(category.id), category);
      }
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'counts'] });
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
    onSuccess: (category, variables) => {
      queryClient.setQueryData(categoryKeys.detail(variables.id), category);
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'counts'] });
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
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: categoryKeys.detail(id), exact: true });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'list'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'paged'] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories, 'counts'] });
      toast.success(messages.categoryDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.categoryError}: ${error.message}`);
    },
  });
};

