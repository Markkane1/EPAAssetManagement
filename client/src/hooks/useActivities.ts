import { useQuery } from '@tanstack/react-query';
import { API_CONFIG } from '@/config/api.config';
import { activityService } from '@/services/activityService';
import type { ActivityListQuery } from '@/services/activityService';

const { query } = API_CONFIG;
const { heavyList, detail } = query.profiles;

export const usePagedActivities = (queryInput: ActivityListQuery = {}, enabled = true) =>
  useQuery({
    queryKey: [
      'activities',
      'paged',
      queryInput.page ?? 1,
      queryInput.limit ?? null,
      queryInput.search?.trim() || '',
      queryInput.activityType?.trim() || 'all',
    ],
    queryFn: () => activityService.getPagedActivities(queryInput),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });

export const useActivities = (queryInput: ActivityListQuery = {}, enabled = true) =>
  useQuery({
    queryKey: [
      'activities',
      'list',
      queryInput.search?.trim() || '',
      queryInput.activityType?.trim() || 'all',
    ],
    queryFn: () => activityService.getAllActivities(queryInput),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });

export const useRecentActivities = (limit = 50, enabled = true) =>
  useQuery({
    queryKey: ['activities', 'recent', limit],
    queryFn: () => activityService.getRecentActivities(limit),
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
    enabled,
  });

export const useUserActivities = (userId: string, limit = 20, enabled = true) =>
  useQuery({
    queryKey: ['activities', 'user', userId, limit],
    queryFn: () => activityService.getUserActivities(userId, limit),
    staleTime: detail.staleTime,
    refetchOnWindowFocus: detail.refetchOnWindowFocus,
    enabled: enabled && !!userId,
  });
