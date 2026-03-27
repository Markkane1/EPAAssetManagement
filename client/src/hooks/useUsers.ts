import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { userService } from '@/services/userService';
import type { CreateUserDto, UserListQuery } from '@/services/userService';
import { userPermissionService } from '@/services/userPermissionService';
import type { AppRole } from '@/services/authService';

const { queryKeys, query } = API_CONFIG;
const { heavyList, referenceData } = query.profiles;

type QueryToggleOptions = {
  enabled?: boolean;
};

export const usePagedUsers = (queryInput: UserListQuery, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [
      ...queryKeys.users,
      'paged',
      queryInput.page ?? 1,
      queryInput.limit ?? null,
      queryInput.search?.trim() || '',
    ],
    queryFn: () => userService.getPaged(queryInput),
    staleTime: heavyList.staleTime,
    refetchOnWindowFocus: heavyList.refetchOnWindowFocus,
    enabled,
  });
};

export const useUsersLookup = (queryInput: UserListQuery = {}, options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [
      ...queryKeys.users,
      'lookup',
      queryInput.page ?? 1,
      queryInput.limit ?? null,
      queryInput.search?.trim() || '',
    ],
    queryFn: () => userService.getAll(queryInput),
    staleTime: referenceData.staleTime,
    refetchOnWindowFocus: referenceData.refetchOnWindowFocus,
    enabled,
  });
};

export const useUserRolePermissionsCatalog = (options: QueryToggleOptions = {}) => {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...queryKeys.pagePermissions, 'catalog'],
    queryFn: () => userPermissionService.getRolePermissions(),
    staleTime: referenceData.staleTime,
    refetchOnWindowFocus: referenceData.refetchOnWindowFocus,
    enabled,
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserDto) => userService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success('User created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create user: ${error.message}`);
    },
  });
};

export const useUpdateUserRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: { role?: AppRole; roles?: AppRole[]; activeRole?: AppRole };
    }) => userService.updateRole(userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success('User role updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update role: ${error.message}`);
    },
  });
};

export const useUpdateUserLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, locationId }: { userId: string; locationId: string | null }) =>
      userService.updateLocation(userId, locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success('User location updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update location: ${error.message}`);
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => userService.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success('User deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete user: ${error.message}`);
    },
  });
};

export const useResetUserPassword = () =>
  useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      userService.resetPassword(userId, newPassword),
    onSuccess: () => {
      toast.success('Password reset successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset password: ${error.message}`);
    },
  });
