/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import authService, { AppRole, User, normalizeRole } from '@/services/authService';
import { activityService } from '@/services/activityService';
import api from '@/lib/api';
import { userPermissionService } from '@/services/userPermissionService';
import { setRuntimeRolePermissions } from '@/config/pagePermissions';

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  activeRole: AppRole | null;
  roles: AppRole[];
  isOrgAdmin: boolean;
  locationId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  switchActiveRole: (nextRole: AppRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCurrentUser = async () => {
    try {
      const me = await api.get<{
        id: string;
        email: string;
        firstName?: string | null;
        lastName?: string | null;
        role: string;
        activeRole?: string | null;
        roles?: string[];
        locationId?: string | null;
      }>('/auth/me');
      const normalizedRole = normalizeRole(me.role);
      const normalizedRoles = Array.isArray(me.roles) && me.roles.length > 0
        ? me.roles.map((entry) => normalizeRole(entry))
        : [normalizedRole];
      const normalizedActiveRole = normalizeRole(me.activeRole || me.role);
      const normalizedUser = {
        id: me.id,
        email: me.email,
        firstName: me.firstName || null,
        lastName: me.lastName || null,
        role: normalizedRole,
        activeRole: normalizedActiveRole,
        roles: normalizedRoles,
      };
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      setRole(normalizedRole);
      setActiveRole(normalizedActiveRole);
      setRoles(normalizedRoles);
      setIsOrgAdmin(normalizedRoles.includes('org_admin') || normalizedRole === 'org_admin');
      setLocationId(me.locationId || null);

      try {
        const runtime = await userPermissionService.getEffectiveRolePermissions();
        setRuntimeRolePermissions([
          {
            id: String(runtime.role || normalizedRole),
            sourceRoles: [String(runtime.role || normalizedRole)],
            permissions: runtime.permissions || {},
          },
        ]);
      } catch {
        setRuntimeRolePermissions(null);
      }
    } catch {
      authService.logout();
      setUser(null);
      setRole(null);
      setActiveRole(null);
      setRoles([]);
      setIsOrgAdmin(false);
      setLocationId(null);
      setRuntimeRolePermissions(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const login = async (email: string, password: string) => {
    await authService.login({ email, password });
    await loadCurrentUser();
    await activityService.logLogin();
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    await authService.register({ email, password, firstName, lastName });
    await loadCurrentUser();
  };

  const switchActiveRole = async (nextRole: AppRole) => {
    await authService.setActiveRole(nextRole);
    await loadCurrentUser();
  };

  const logout = async () => {
    try {
      await activityService.logLogout();
    } catch {
      // Best effort only
    }
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout API errors and clear local state anyway
    }
    authService.logout();
    setUser(null);
    setRole(null);
    setActiveRole(null);
    setRoles([]);
    setIsOrgAdmin(false);
    setLocationId(null);
    setRuntimeRolePermissions(null);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user,
        role,
        activeRole,
        roles,
        isOrgAdmin,
        locationId,
        isAuthenticated: !!user, 
        isLoading,
        login,
        register,
        switchActiveRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
