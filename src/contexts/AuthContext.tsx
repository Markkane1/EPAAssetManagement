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
    const current = authService.getCurrentUser();
    if (!current) {
      setUser(null);
      setRole(null);
      setIsSuperAdmin(false);
      setLocationId(null);
      setIsLoading(false);
      return;
    }

    const normalizedRole = normalizeRole(current.role);
    const normalizedUser = { ...current, role: normalizedRole };
    setUser(normalizedUser);
    setRole(normalizedRole);
    setIsSuperAdmin(normalizedRole === 'super_admin');

    try {
      const me = await api.get<{ locationId?: string | null }>('/auth/me');
      setLocationId(me.locationId || null);
    } catch {
      setLocationId(null);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const login = async (email: string, password: string) => {
    const { user: loggedInUser } = await authService.login({ email, password });
    const normalizedRole = normalizeRole(loggedInUser.role);
    setUser({ ...loggedInUser, role: normalizedRole });
    setRole(normalizedRole);
    setIsSuperAdmin(normalizedRole === 'super_admin');
    await loadCurrentUser();
    await activityService.logLogin();
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    await authService.register({ email, password, firstName, lastName });
    await loadCurrentUser();
  };

  const logout = async () => {
    await activityService.logLogout();
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
