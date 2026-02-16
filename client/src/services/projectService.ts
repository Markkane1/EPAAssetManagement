import api from '@/lib/api';
import { Project } from '@/types';

const LIST_LIMIT = 1000;

export interface ProjectCreateDto {
  name: string;
  code: string;
  description?: string;
  startDate: string;
  endDate?: string;
  budget?: number;
  isActive?: boolean;
}

export interface ProjectUpdateDto {
  name?: string;
  code?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  isActive?: boolean;
}

export const projectService = {
  getAll: () => api.get<Project[]>(`/projects?limit=${LIST_LIMIT}`),
  
  getById: (id: string) => api.get<Project>(`/projects/${id}`),
  
  getActive: () => api.get<Project[]>(`/projects/active?limit=${LIST_LIMIT}`),
  
  create: (data: ProjectCreateDto) => api.post<Project>('/projects', data),
  
  update: (id: string, data: ProjectUpdateDto) => api.put<Project>(`/projects/${id}`, data),
  
  delete: (id: string) => api.delete(`/projects/${id}`),
};

export default projectService;

