import api from '@/lib/api';
import type { AppRole } from '@/services/authService';

export interface UserWithDetails {
  id: string;
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  location_id: string | null;
  created_at: string;
  role: AppRole | null;
  location_name: string | null;
}

export interface CreateUserDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: AppRole;
  locationId?: string;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PagedUsersResponse {
  items: UserWithDetails[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const userService = {
  getAll: (query: UserListQuery = {}) => {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search && query.search.trim().length > 0) params.set('search', query.search.trim());
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return api.get<UserWithDetails[]>(`/users${suffix}`);
  },
  getPaged: (query: UserListQuery = {}) => {
    const params = new URLSearchParams();
    params.set('meta', '1');
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search && query.search.trim().length > 0) params.set('search', query.search.trim());
    return api.get<PagedUsersResponse>(`/users?${params.toString()}`);
  },
  create: (data: CreateUserDto) => api.post<UserWithDetails>('/users', data),
  updateRole: (userId: string, role: AppRole) => api.put(`/users/${userId}/role`, { role }),
  updateLocation: (userId: string, locationId: string | null) =>
    api.put(`/users/${userId}/location`, { locationId }),
  resetPassword: (userId: string, newPassword: string) =>
    api.put(`/users/${userId}/password`, { newPassword }),
  delete: (userId: string) => api.delete(`/users/${userId}`),
};

export default userService;
