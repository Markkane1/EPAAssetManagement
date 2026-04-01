import api from '@/lib/api';
import { Employee } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';
import { fetchAllPages } from '@/services/fetchAllPages';

const LIST_LIMIT = 2000;

export interface EmployeeCreateDto {
  firstName: string;
  lastName: string;
  email: string;
  userPassword?: string;
  phone?: string;
  jobTitle?: string;
  hireDate?: string;
  directorateId?: string;
  locationId?: string;
  defaultSubLocationId?: string;
  allowedSubLocationIds?: string[];
}

export interface EmployeeUpdateDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  hireDate?: string;
  directorateId?: string;
  locationId?: string;
  defaultSubLocationId?: string | null;
  allowedSubLocationIds?: string[];
  isActive?: boolean;
}

export interface EmployeeTransferDto {
  newOfficeId: string;
  reason?: string;
}

export type EmployeeListQuery = ListQuery;

export const employeeService = {
  getAll: (query: EmployeeListQuery = {}) =>
    fetchAllPages(
      query,
      (pagedQuery) =>
        api.get<PagedListResponse<Employee>>(
          `/employees${toListQueryString({ limit: LIST_LIMIT, ...pagedQuery, meta: true })}`
        ),
      { pageSize: LIST_LIMIT }
    ),

  getPaged: (query: EmployeeListQuery = {}) =>
    api.get<PagedListResponse<Employee>>(
      `/employees${toListQueryString({ limit: LIST_LIMIT, ...query, meta: true })}`
    ),
  
  getById: (id: string) => api.get<Employee>(`/employees/${id}`),

  getByDirectorate: (directorateId: string) =>
    api.get<Employee[]>(`/employees/directorate/${directorateId}?limit=${LIST_LIMIT}`),
  
  create: (data: EmployeeCreateDto) =>
    api.post<Employee>('/employees', data),
  
  update: (id: string, data: EmployeeUpdateDto) => api.put<Employee>(`/employees/${id}`, data),

  transfer: (id: string, data: EmployeeTransferDto) =>
    api.post<Employee>(`/employees/${id}/transfer`, data),
  
  delete: (id: string) => api.delete(`/employees/${id}`),
};

export default employeeService;

