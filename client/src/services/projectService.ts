import api from '@/lib/api';
import { Project } from '@/types';
import { ListQuery, PagedListResponse, toListQueryString } from '@/services/pagination';
import { fetchAllPages } from '@/services/fetchAllPages';

const LIST_LIMIT = 1000;

export interface ProjectListQuery extends ListQuery {
  search?: string;
}

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

function buildProjectQuery(query: ProjectListQuery = {}, meta = false) {
  const params = new URLSearchParams();
  const pagination = toListQueryString({ limit: LIST_LIMIT, ...query, meta });
  if (pagination.startsWith('?')) {
    const queryString = new URLSearchParams(pagination.slice(1));
    queryString.forEach((value, key) => params.set(key, value));
  }
  if (query.search?.trim()) params.set('search', query.search.trim());
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const projectService = {
  getAll: (query: ProjectListQuery = {}) =>
    fetchAllPages(
      query,
      (pagedQuery) => api.get<PagedListResponse<Project>>(`/projects${buildProjectQuery(pagedQuery, true)}`),
      { pageSize: LIST_LIMIT }
    ),

  getPaged: (query: ProjectListQuery = {}) =>
    api.get<PagedListResponse<Project>>(`/projects${buildProjectQuery(query, true)}`),
  
  getById: (id: string) => api.get<Project>(`/projects/${id}`),
  
  getActive: (query: ProjectListQuery = {}) =>
    fetchAllPages(
      query,
      (pagedQuery) => api.get<PagedListResponse<Project>>(`/projects/active${buildProjectQuery(pagedQuery, true)}`),
      { pageSize: LIST_LIMIT }
    ),

  getPagedActive: (query: ProjectListQuery = {}) =>
    api.get<PagedListResponse<Project>>(`/projects/active${buildProjectQuery(query, true)}`),
  
  create: (data: ProjectCreateDto) => api.post<Project>('/projects', data),
  
  update: (id: string, data: ProjectUpdateDto) => api.put<Project>(`/projects/${id}`, data),
  
  delete: (id: string) => api.delete(`/projects/${id}`),
};

export default projectService;

