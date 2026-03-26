import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { normalizeRole, type User } from '@/services/authService';

type AuthMeResponse = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  activeRole?: string | null;
  roles?: string[];
};

export const useCurrentUser = () => {
  return useQuery<User | null>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const me = await api.get<AuthMeResponse>('/auth/me');
        const normalizedRole = normalizeRole(me.role);
        const normalizedRoles = Array.isArray(me.roles) && me.roles.length > 0
          ? me.roles.map((entry) => normalizeRole(entry))
          : [normalizedRole];
        return {
          id: me.id,
          email: me.email,
          firstName: me.firstName || null,
          lastName: me.lastName || null,
          role: normalizedRole,
          activeRole: normalizeRole(me.activeRole || me.role),
          roles: normalizedRoles,
        };
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
};

export const useIsAuthenticated = () => {
  const { data } = useCurrentUser();
  return Boolean(data);
};
