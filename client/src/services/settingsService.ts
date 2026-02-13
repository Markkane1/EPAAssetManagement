import api from '@/lib/api';
import { SystemInfo, SystemSettings } from '@/types';

export interface SettingsResponse {
  settings: SystemSettings;
  systemInfo: SystemInfo;
}

export const settingsService = {
  getSettings: () => api.get<SettingsResponse>('/settings'),
  updateSettings: (payload: Partial<SystemSettings>) =>
    api.put<SettingsResponse>('/settings', payload),
  backupData: () => api.post<{ message: string; systemInfo: SystemInfo }>('/settings/backup'),
  testEmail: () => api.post<{ message: string }>('/settings/test-email'),
};

export default settingsService;
