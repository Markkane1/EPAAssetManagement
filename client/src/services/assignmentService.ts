import api from '@/lib/api';
import { Assignment } from '@/types';

export interface AssignmentCreateDto {
  assetItemId: string;
  employeeId: string;
  assignedDate: string;
  expectedReturnDate?: string;
  notes?: string;
}

export interface AssignmentUpdateDto {
  assetItemId?: string;
  employeeId?: string;
  assignedDate?: string;
  returnedDate?: string;
  expectedReturnDate?: string;
  notes?: string;
}

const LIST_LIMIT = 1000;

export const assignmentService = {
  getAll: () => api.get<Assignment[]>(`/assignments?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<Assignment>(`/assignments/${id}`),
  
  getByEmployee: (employeeId: string) =>
    api.get<Assignment[]>(`/assignments/employee/${employeeId}?limit=${LIST_LIMIT}`),
  
  getByAssetItem: (assetItemId: string) =>
    api.get<Assignment[]>(`/assignments/asset-item/${assetItemId}?limit=${LIST_LIMIT}`),
  
  create: (data: AssignmentCreateDto) => api.post<Assignment>('/assignments', data),
  
  update: (id: string, data: AssignmentUpdateDto) => api.put<Assignment>(`/assignments/${id}`, data),
  
  returnAsset: (id: string, returnDate: string) => api.put<Assignment>(`/assignments/${id}/return`, { returnDate }),

  reassign: (id: string, newEmployeeId: string, notes?: string) =>
    api.put<Assignment>(`/assignments/${id}/reassign`, { newEmployeeId, notes }),
  
  delete: (id: string) => api.delete(`/assignments/${id}`),
};

export default assignmentService;

