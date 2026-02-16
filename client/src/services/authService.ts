import api from '@/lib/api';

export type AppRole =
  | 'org_admin'
  | 'office_head'
  | 'caretaker'
  | 'employee'
  | (string & {});

export const normalizeRole = (role?: string | null): AppRole => {
  switch (role) {
    case 'org_admin':
      return 'org_admin';
    case 'office_head':
      return 'office_head';
    case 'caretaker':
      return 'caretaker';
    case 'employee':
      return 'employee';
    default:
      return 'employee';
  }
};

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  role?: AppRole;
  locationId?: string;
}

export interface AuthResponse {
  token?: string;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: AppRole;
  };
}

export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: AppRole;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export const authService = {
  login: async (data: LoginDto): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', data);
    const normalizedUser = {
      ...response.user,
      role: normalizeRole(response.user.role),
    };
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    return { ...response, user: normalizedUser };
  },
  
  register: async (data: RegisterDto): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    const normalizedUser = {
      ...response.user,
      role: normalizeRole(response.user.role),
    };
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    return { ...response, user: normalizedUser };
  },
  
  logout: () => {
    localStorage.removeItem('user');
  },

  requestPasswordReset: async (email: string): Promise<{ message: string }> => {
    return api.post<{ message: string }>('/auth/forgot-password', { email });
  },

  resetPassword: async (data: ResetPasswordDto): Promise<{ message: string }> => {
    return api.post<{ message: string }>('/auth/reset-password', data);
  },
  
  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    const parsed = JSON.parse(userStr) as User;
    const normalized = { ...parsed, role: normalizeRole(parsed.role) };
    if (normalized.role !== parsed.role) {
      localStorage.setItem('user', JSON.stringify(normalized));
    }
    return normalized;
  },
  
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('user');
  },
};

export default authService;

