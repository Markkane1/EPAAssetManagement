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
import type { Category } from '@/types';
import {
  refreshActiveQueries,
  removeEntityFromQueryCaches,
  syncEntityInQueryCaches,
} from '@/lib/queryRefresh';

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

function matchesCategorySearch(category: Category, rawSearch: unknown) {
  const search = String(rawSearch || '').trim().toLowerCase();
  if (!search) return true;
  const haystack = [
    category.name,
    category.description,
    ...(category.subcategories || []),
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return haystack.includes(search);
}

function sortCategories(items: Category[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function syncCategoryCaches(queryClient: ReturnType<typeof useQueryClient>, category: Category) {
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.categories, 'list'],
    entity: category,
    matchesQuery: (queryKey, entity) => {
      const scope = String(queryKey[2] || 'ALL_SCOPE');
      const assetType = String(queryKey[3] || 'ALL_TYPE');
      const matchesScope = scope === 'ALL_SCOPE' || String(entity.scope || '') === scope;
      const matchesAssetType = assetType === 'ALL_TYPE' || String(entity.asset_type || '') === assetType;
      return matchesScope && matchesAssetType && matchesCategorySearch(entity, queryKey[4]);
    },
    sortItems: sortCategories,
  });
  syncEntityInQueryCaches(queryClient, {
    queryKey: [...queryKeys.categories, 'paged'],
    entity: category,
    matchesQuery: (queryKey, entity) => {
      const scope = String(queryKey[4] || 'ALL_SCOPE');
      const assetType = String(queryKey[5] || 'ALL_TYPE');
      const matchesScope = scope === 'ALL_SCOPE' || String(entity.scope || '') === scope;
      const matchesAssetType = assetType === 'ALL_TYPE' || String(entity.asset_type || '') === assetType;
      return matchesScope && matchesAssetType && matchesCategorySearch(entity, queryKey[6]);
    },
    getPageInfo: (queryKey) => ({
      page: Number(queryKey[2] || 1),
      limit: queryKey[3] === null ? null : Number(queryKey[3] || 0) || null,
    }),
    sortItems: sortCategories,
  });
}

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
    onSuccess: async (category) => {
      if (category?.id) {
        queryClient.setQueryData(categoryKeys.detail(category.id), category);
        syncCategoryCaches(queryClient, category);
      }
      await refreshActiveQueries(queryClient, [
        [...queryKeys.categories, 'list'],
        [...queryKeys.categories, 'paged'],
        [...queryKeys.categories, 'counts'],
      ]);
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
    onSuccess: async (category, variables) => {
      queryClient.setQueryData(categoryKeys.detail(variables.id), category);
      syncCategoryCaches(queryClient, category);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.categories, 'list'],
        [...queryKeys.categories, 'paged'],
        [...queryKeys.categories, 'counts'],
      ]);
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
    onSuccess: async (_data, id) => {
      queryClient.removeQueries({ queryKey: categoryKeys.detail(id), exact: true });
      removeEntityFromQueryCaches(queryClient, [...queryKeys.categories, 'list'], id);
      removeEntityFromQueryCaches(queryClient, [...queryKeys.categories, 'paged'], id);
      await refreshActiveQueries(queryClient, [
        [...queryKeys.categories, 'list'],
        [...queryKeys.categories, 'paged'],
        [...queryKeys.categories, 'counts'],
      ]);
      toast.success(messages.categoryDeleted);
    },
    onError: (error: Error) => {
      toast.error(`${messages.categoryError}: ${error.message}`);
    },
  });
};

