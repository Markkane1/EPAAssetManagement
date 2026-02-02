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

export const userService = {
  getAll: () => api.get<UserWithDetails[]>('/users'),
  create: (data: CreateUserDto) => api.post<UserWithDetails>('/users', data),
  updateRole: (userId: string, role: AppRole) => api.put(`/users/${userId}/role`, { role }),
  updateLocation: (userId: string, locationId: string | null) =>
    api.put(`/users/${userId}/location`, { locationId }),
  resetPassword: (userId: string, newPassword: string) =>
    api.put(`/users/${userId}/password`, { newPassword }),
  delete: (userId: string) => api.delete(`/users/${userId}`),
};

export default userService;
