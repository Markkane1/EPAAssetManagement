import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { API_CONFIG } from '@/config/api.config';
import { userPermissionService } from '@/services/userPermissionService';
import type { RolePermission } from '@/services/userPermissionService';
import { setRuntimeRolePermissions } from '@/config/pagePermissions';

const { queryKeys, query } = API_CONFIG;
const { referenceData } = query.profiles;

export const useRolePermissionsCatalog = (enabled = true) =>
  useQuery({
    queryKey: [...queryKeys.pagePermissions, 'catalog'],
    queryFn: () => userPermissionService.getRolePermissions(),
    staleTime: referenceData.staleTime,
    refetchOnWindowFocus: referenceData.refetchOnWindowFocus,
    enabled,
  });

export const useUpdateRolePermissionsCatalog = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { roles: RolePermission[] }) =>
      userPermissionService.updateRolePermissions(payload),
    onSuccess: (response) => {
      setRuntimeRolePermissions(response.roles);
      queryClient.setQueryData([...queryKeys.pagePermissions, 'catalog'], response);
      toast.success('Permissions saved successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save permissions');
    },
  });
};
