/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import authService, { AppRole, User, normalizeRole } from '@/services/authService';
import { activityService } from '@/services/activityService';
import api, { ApiError } from '@/lib/api';
import { userPermissionService } from '@/services/userPermissionService';
import {
  cacheRuntimeAuthorizationState,
  clearCachedRuntimeAuthorizationState,
  clearRuntimeAuthorizationState,
  hydrateRuntimeAuthorizationState,
  setRuntimeAllowedPages,
  setRuntimeAuthorizationCatalog,
  setRuntimeAuthorizationPolicy,
  setRuntimeRolePermissions,
} from '@/config/pagePermissions';
import { clearAuditLogs } from '@/lib/auditLog';

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
  const currentUserIdRef = useRef<string | null>(null);

  const loadCurrentUser = useCallback(async () => {
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
        locationId: me.locationId || null,
      };
      if (currentUserIdRef.current && currentUserIdRef.current !== normalizedUser.id) {
        clearAuditLogs();
      }
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      currentUserIdRef.current = normalizedUser.id;
      setUser(normalizedUser);
      setRole(normalizedRole);
      setActiveRole(normalizedActiveRole);
      setRoles(normalizedRoles);
      setIsOrgAdmin(normalizedRoles.includes('org_admin') || normalizedRole === 'org_admin');
      setLocationId(me.locationId || null);

      const hydratedFromCache = hydrateRuntimeAuthorizationState({
        userId: normalizedUser.id,
        activeRole: normalizedActiveRole,
      });

      try {
        const runtime = await userPermissionService.getEffectiveRolePermissions();
        const runtimePolicy = runtime.policy || runtime.authorization_policy || null;
        setRuntimeAuthorizationCatalog(runtime.catalog);
        setRuntimeAllowedPages(runtime.allowed_pages || []);
        setRuntimeAuthorizationPolicy(runtimePolicy);
        const rolePermissions = [
          {
            id: String(runtime.role || normalizedRole),
            sourceRoles: [String(runtime.role || normalizedRole)],
            permissions: runtime.permissions || {},
          },
        ];
        setRuntimeRolePermissions(rolePermissions);
        cacheRuntimeAuthorizationState({
          userId: normalizedUser.id,
          role: String(runtime.role || normalizedRole),
          activeRole: normalizedActiveRole,
          allowedPages: runtime.allowed_pages || [],
          rolePermissions,
          catalog: runtime.catalog,
          policy: runtimePolicy,
        });
      } catch {
        if (!hydratedFromCache) {
          clearRuntimeAuthorizationState();
          clearCachedRuntimeAuthorizationState();
        }
      }
    } catch (err) {
      // Only clear local auth state on confirmed auth failures (401/403).
      // Network errors, timeouts, and 5xx responses are transient — treating
      // them the same as a real logout causes confusing "flash logout" behaviour
      // even though the cookie session is still valid.
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401 || status === 403) {
        authService.logout();
        clearAuditLogs();
        currentUserIdRef.current = null;
        setUser(null);
        setRole(null);
        setActiveRole(null);
        setRoles([]);
        setIsOrgAdmin(false);
        setLocationId(null);
        clearRuntimeAuthorizationState();
        clearCachedRuntimeAuthorizationState();
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const cachedUser = authService.getCurrentUser();
    if (cachedUser) {
      currentUserIdRef.current = cachedUser.id;
      setUser(cachedUser);
      setRole(cachedUser.role);
      setActiveRole(cachedUser.activeRole || cachedUser.role);
      setRoles(cachedUser.roles || [cachedUser.role]);
      setIsOrgAdmin(
        (cachedUser.roles || [cachedUser.role]).includes('org_admin') ||
          cachedUser.role === 'org_admin'
      );
      setLocationId(cachedUser.locationId || null);
      hydrateRuntimeAuthorizationState({
        userId: cachedUser.id,
        activeRole: cachedUser.activeRole || cachedUser.role,
      });
    }
    loadCurrentUser();
  }, [loadCurrentUser]);

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
    clearAuditLogs();
    currentUserIdRef.current = null;
    setUser(null);
    setRole(null);
    setActiveRole(null);
    setRoles([]);
    setIsOrgAdmin(false);
    setLocationId(null);
    clearRuntimeAuthorizationState();
    clearCachedRuntimeAuthorizationState();
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
