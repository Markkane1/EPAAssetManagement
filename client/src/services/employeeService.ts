import api from '@/lib/api';
import { Employee } from '@/types';

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
  isActive?: boolean;
}

export const employeeService = {
  getAll: () => api.get<Employee[]>(`/employees?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<Employee>(`/employees/${id}`),

  getByDirectorate: (directorateId: string) =>
    api.get<Employee[]>(`/employees/directorate/${directorateId}?limit=${LIST_LIMIT}`),
  
  create: (data: EmployeeCreateDto) =>
    api.post<Employee & { tempPassword?: string }>('/employees', data),
  
  update: (id: string, data: EmployeeUpdateDto) => api.put<Employee>(`/employees/${id}`, data),
  
  delete: (id: string) => api.delete(`/employees/${id}`),
};

export default employeeService;

