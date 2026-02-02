import api from '@/lib/api';
import { Employee } from '@/types';

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
}

export const employeeService = {
  getAll: () => api.get<Employee[]>('/employees'),
  
  getById: (id: string) => api.get<Employee>(`/employees/${id}`),

  getByDirectorate: (directorateId: string) => api.get<Employee[]>(`/employees/directorate/${directorateId}`),
  
  create: (data: EmployeeCreateDto) =>
    api.post<Employee & { tempPassword?: string }>('/employees', data),
  
  update: (id: string, data: EmployeeUpdateDto) => api.put<Employee>(`/employees/${id}`, data),
  
  delete: (id: string) => api.delete(`/employees/${id}`),
};

export default employeeService;

