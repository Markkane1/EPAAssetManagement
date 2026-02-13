import { useQuery } from '@tanstack/react-query';
import { authService, User } from '@/services/authService';

export const useCurrentUser = () => {
  return useQuery<User | null>({
    queryKey: ['currentUser'],
    queryFn: () => authService.getCurrentUser(),
    staleTime: Infinity,
  });
};

export const useIsAuthenticated = () => {
  return authService.isAuthenticated();
};
