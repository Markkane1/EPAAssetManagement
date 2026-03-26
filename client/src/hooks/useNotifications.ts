import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_CONFIG } from '@/config/api.config';
import {
  notificationService,
  type NotificationListQuery,
} from '@/services/notificationService';

const { queryKeys, query } = API_CONFIG;
const { live } = query.profiles;

type UseNotificationsParams = NotificationListQuery & {
  scopeKey?: string | number | null;
  enabled?: boolean;
};

export const useNotifications = (params: UseNotificationsParams = {}) => {
  const { unreadOnly, limit, page, scopeKey = 'default', enabled = true } = params;
  return useQuery({
    queryKey: [...queryKeys.notifications, scopeKey, unreadOnly ?? false, limit ?? 20, page ?? 1],
    queryFn: () => notificationService.list({ unreadOnly, limit, page }),
    staleTime: live.staleTime,
    refetchOnWindowFocus: live.refetchOnWindowFocus,
    enabled,
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
};

export const useNotificationAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; action: 'APPROVE' | 'REJECT' | 'ACKNOWLEDGE' | 'OPEN_RECORD'; decisionNotes?: string }) =>
      notificationService.action(payload.id, { action: payload.action, decisionNotes: payload.decisionNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
};
