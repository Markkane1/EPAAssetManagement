import api from '@/lib/api';
import { Assignment } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';
import { fetchAllPages } from '@/services/fetchAllPages';

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

export type AssignmentListQuery = ListQuery;

export interface AssignmentListItem extends Assignment {
  itemTag?: string | null;
  assetName?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
}

export const assignmentService = {
  getAll: (query: AssignmentListQuery = {}) =>
    fetchAllPages(
      query,
      (pagedQuery) =>
        api.get<PagedListResponse<AssignmentListItem>>(
          `/assignments${toListQueryString({ limit: LIST_LIMIT, ...pagedQuery, meta: true, details: true })}`
        ),
      { pageSize: LIST_LIMIT }
    ),

  getPaged: (query: AssignmentListQuery = {}) =>
    api.get<PagedListResponse<AssignmentListItem>>(
      `/assignments${toListQueryString({ limit: LIST_LIMIT, ...query, meta: true, details: true })}`
    ),
  
  getById: (id: string) => api.get<Assignment>(`/assignments/${id}`),
  
  getByEmployee: (employeeId: string) =>
    api.get<Assignment[]>(`/assignments/employee/${employeeId}?limit=${LIST_LIMIT}`),
  
  getByAssetItem: (assetItemId: string) =>
    api.get<Assignment[]>(`/assignments/asset-item/${assetItemId}?limit=${LIST_LIMIT}`),
  
  create: (data: AssignmentCreateDto) => api.post<Assignment>('/assignments', data),
  
  update: (id: string, data: AssignmentUpdateDto) => api.put<Assignment>(`/assignments/${id}`, data),

  reassign: (id: string, newEmployeeId: string, notes?: string) =>
    api.put<Assignment>(`/assignments/${id}/reassign`, { newEmployeeId, notes }),

  downloadHandoverSlipPdf: (id: string) => api.download(`/assignments/${id}/handover-slip.pdf`),

  uploadSignedHandoverSlip: (id: string, data: FormData) =>
    api.upload<Assignment>(`/assignments/${id}/handover-slip/upload-signed`, data),

  requestReturn: (id: string) => api.post<Assignment>(`/assignments/${id}/request-return`),

  downloadReturnSlipPdf: (id: string) => api.download(`/assignments/${id}/return-slip.pdf`),

  uploadSignedReturnSlip: (id: string, data: FormData) =>
    api.upload<Assignment>(`/assignments/${id}/return-slip/upload-signed`, data),
  
  delete: (id: string) => api.delete(`/assignments/${id}`),
};

export default assignmentService;

