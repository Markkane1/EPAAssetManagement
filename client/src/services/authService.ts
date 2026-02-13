import api from '@/lib/api';

export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'location_admin'
  | 'caretaker'
  | 'assistant_caretaker'
  | 'central_store_admin'
  | 'lab_manager'
  | 'lab_user'
  | 'auditor'
  | 'user'
  | 'viewer'
  | 'employee'
  | 'directorate_head';

export const normalizeRole = (role?: string | null): AppRole => {
  switch (role) {
    case 'super_admin':
      return 'super_admin';
    case 'admin':
      return 'admin';
    case 'location_admin':
      return 'location_admin';
    case 'caretaker':
      return 'caretaker';
    case 'assistant_caretaker':
      return 'assistant_caretaker';
    case 'central_store_admin':
      return 'central_store_admin';
    case 'lab_manager':
      return 'lab_manager';
    case 'lab_user':
      return 'lab_user';
    case 'auditor':
      return 'auditor';
    case 'manager':
      return 'admin';
    case 'user':
      return 'user';
    case 'viewer':
      return 'viewer';
    case 'employee':
      return 'employee';
    case 'directorate_head':
      return 'directorate_head';
    default:
      return 'user';
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

