import api from '@/lib/api';
import { MaintenanceRecord, MaintenanceType, MaintenanceStatus } from '@/types';

export interface MaintenanceCreateDto {
  assetItemId: string;
  type: MaintenanceType;
  description: string;
  scheduledDate: string;
  cost?: number;
  performedBy?: string;
  notes?: string;
}

export interface MaintenanceUpdateDto {
  assetItemId?: string;
  type?: MaintenanceType;
  status?: MaintenanceStatus;
  description?: string;
  scheduledDate?: string;
  completedDate?: string;
  cost?: number;
  performedBy?: string;
  notes?: string;
}

const LIST_LIMIT = 1000;

export const maintenanceService = {
  getAll: () => api.get<MaintenanceRecord[]>(`/maintenance?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<MaintenanceRecord>(`/maintenance/${id}`),
  
  getByAssetItem: (assetItemId: string) =>
    api.get<MaintenanceRecord[]>(`/maintenance/asset-item/${assetItemId}?limit=${LIST_LIMIT}`),
  
  getScheduled: () => api.get<MaintenanceRecord[]>(`/maintenance/scheduled?limit=${LIST_LIMIT}`),
  
  create: (data: MaintenanceCreateDto) =>
    api.post<MaintenanceRecord>('/maintenance', {
      ...data,
      maintenanceType: data.type,
      performedBy: data.performedBy,
      scheduledDate: data.scheduledDate,
    }),
  
  update: (id: string, data: MaintenanceUpdateDto) =>
    api.put<MaintenanceRecord>(`/maintenance/${id}`, {
      ...data,
      maintenanceType: data.type,
      maintenanceStatus: data.status,
      performedBy: data.performedBy,
      scheduledDate: data.scheduledDate,
      completedDate: data.completedDate,
    }),
  
  complete: (id: string, completedDate: string, notes?: string) => 
    api.put<MaintenanceRecord>(`/maintenance/${id}/complete`, { completedDate, notes }),
  
  delete: (id: string) => api.delete(`/maintenance/${id}`),
};

export default maintenanceService;

