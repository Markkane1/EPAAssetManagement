import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '@/services/settingsService';
import { API_CONFIG } from '@/config/api.config';
import { SystemSettings } from '@/types';

const { queryKeys, query } = API_CONFIG;

export const useSystemSettings = () => {
  return useQuery({
    queryKey: [...queryKeys.settings],
    queryFn: settingsService.getSettings,
    staleTime: query.staleTime,
  });
};

export const useUpdateSystemSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<SystemSettings>) => settingsService.updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.settings] });
    },
  });
};

export const useBackupData = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => settingsService.backupData(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.settings] });
    },
  });
};

export const useTestEmail = () => {
  return useMutation({
    mutationFn: () => settingsService.testEmail(),
  });
};
