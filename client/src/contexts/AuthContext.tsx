/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import authService, { AppRole, User, normalizeRole } from '@/services/authService';
import { activityService } from '@/services/activityService';
import api from '@/lib/api';

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  isSuperAdmin: boolean;
  locationId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
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
        locationId?: string | null;
      }>('/auth/me');
      const normalizedRole = normalizeRole(me.role);
      const normalizedUser = {
        id: me.id,
        email: me.email,
        firstName: me.firstName || null,
        lastName: me.lastName || null,
        role: normalizedRole,
      };
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      setRole(normalizedRole);
      setIsSuperAdmin(normalizedRole === 'super_admin');
      setLocationId(me.locationId || null);
    } catch {
      authService.logout();
      setUser(null);
      setRole(null);
      setIsSuperAdmin(false);
      setLocationId(null);
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
    setIsSuperAdmin(false);
    setLocationId(null);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user,
        role,
        isSuperAdmin,
        locationId,
        isAuthenticated: !!user, 
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
