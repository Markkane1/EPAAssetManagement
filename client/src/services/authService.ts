import api from '@/lib/api';

export type AppRole =
  | 'org_admin'
  | 'head_office_admin'
  | 'office_head'
  | 'caretaker'
  | 'employee'
  | 'storekeeper'
  | 'inventory_controller'
  | 'procurement_officer'
  | 'compliance_auditor'
  | (string & {});

export const normalizeRole = (role?: string | null): AppRole => {
  const normalized = String(role || '').trim().toLowerCase();
  switch (normalized) {
    case 'org_admin':
      return 'org_admin';
    case 'head_office_admin':
    case 'headoffice_admin':
      return 'head_office_admin';
    case 'office_head':
      return 'office_head';
    case 'caretaker':
      return 'caretaker';
    case 'employee':
      return 'employee';
    case 'storekeeper':
      return 'storekeeper';
    case 'inventory_controller':
      return 'inventory_controller';
    case 'procurement_officer':
      return 'procurement_officer';
    case 'compliance_auditor':
      return 'compliance_auditor';
    default:
      return (normalized || 'employee') as AppRole;
  }
};

export const isOfficeAdminRole = (role?: string | null): boolean => {
  const normalized = normalizeRole(role);
  return normalized === 'office_head' || normalized === 'head_office_admin';
};

const normalizeRoles = (roles: unknown, fallbackRole?: string | null): AppRole[] => {
  const out = new Set<AppRole>();
  if (Array.isArray(roles)) {
    roles.forEach((entry) => {
      const normalized = normalizeRole(String(entry || ''));
      if (normalized) out.add(normalized);
    });
  }
  const fallback = normalizeRole(fallbackRole || undefined);
  if (fallback) out.add(fallback);
  if (out.size === 0) out.add('employee');
  return Array.from(out);
};

const resolveActiveRole = (activeRole: unknown, roles: AppRole[]) => {
  const normalized = normalizeRole(String(activeRole || ''));
  if (roles.includes(normalized)) return normalized;
  return roles[0] || 'employee';
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
    activeRole?: AppRole;
    roles?: AppRole[];
    locationId?: string | null;
  };
}

export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: AppRole;
  activeRole?: AppRole;
  roles?: AppRole[];
  locationId?: string | null;
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
      roles: normalizeRoles(response.user.roles, response.user.role),
      activeRole: resolveActiveRole(response.user.activeRole || response.user.role, normalizeRoles(response.user.roles, response.user.role)),
      locationId: response.user.locationId || null,
    };
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    return { ...response, user: normalizedUser };
  },
  
  register: async (data: RegisterDto): Promise<AuthResponse> => {
    // Admin-only operation — do NOT write to localStorage. Writing the newly
    // created user's profile here would overwrite the current admin's session
    // identity in the browser, causing the UI to render as the wrong user.
    const response = await api.post<AuthResponse>('/auth/register', data);
    const normalizedUser = {
      ...response.user,
      role: normalizeRole(response.user.role),
      roles: normalizeRoles(response.user.roles, response.user.role),
      activeRole: resolveActiveRole(response.user.activeRole || response.user.role, normalizeRoles(response.user.roles, response.user.role)),
      locationId: response.user.locationId || null,
    };
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

  setActiveRole: async (activeRole: AppRole): Promise<{ role: AppRole; activeRole: AppRole; roles: AppRole[] }> => {
    const response = await api.post<{ role: string; activeRole: string; roles: string[] }>('/auth/active-role', { activeRole });
    const roles = normalizeRoles(response.roles, response.role);
    const next = {
      role: normalizeRole(response.role),
      activeRole: resolveActiveRole(response.activeRole, roles),
      roles,
    };
    const current = authService.getCurrentUser();
    if (current) {
      localStorage.setItem(
        'user',
        JSON.stringify({
          ...current,
          ...next,
        })
      );
    }
    return next;
  },
  
  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    const parsed = JSON.parse(userStr) as User;
    const roles = normalizeRoles(parsed.roles, parsed.role);
    const activeRole = resolveActiveRole(parsed.activeRole || parsed.role, roles);
    const normalized = { ...parsed, role: normalizeRole(parsed.role), roles, activeRole };
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      localStorage.setItem('user', JSON.stringify(normalized));
    }
    return normalized;
  },
  
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('user');
  },
};

export default authService;
