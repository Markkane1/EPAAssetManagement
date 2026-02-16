import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentService, AssignmentCreateDto, AssignmentUpdateDto } from '@/services/assignmentService';
import { toast } from 'sonner';

export const useAssignments = () => {
  return useQuery({
    queryKey: ['assignments'],
    queryFn: assignmentService.getAll,
    staleTime: 30000,
  });
};

export const useAssignment = (id: string) => {
  return useQuery({
    queryKey: ['assignments', id],
    queryFn: () => assignmentService.getById(id),
    enabled: !!id,
  });
};

export const useAssignmentsByEmployee = (employeeId: string) => {
  return useQuery({
    queryKey: ['assignments', 'byEmployee', employeeId],
    queryFn: () => assignmentService.getByEmployee(employeeId),
    enabled: !!employeeId,
  });
};

export const useAssignmentsByAssetItem = (assetItemId: string) => {
  return useQuery({
    queryKey: ['assignments', 'byAssetItem', assetItemId],
    queryFn: () => assignmentService.getByAssetItem(assetItemId),
    enabled: !!assetItemId,
  });
};

export const useCreateAssignment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: AssignmentCreateDto) => assignmentService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assetItems'] });
      toast.success('Assignment created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create assignment: ${error.message}`);
    },
  });
};

export const useUpdateAssignment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignmentUpdateDto }) =>
      assignmentService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Assignment updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update assignment: ${error.message}`);
    },
  });
};

export const useRequestReturn = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id }: { id: string }) => assignmentService.requestReturn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Return requested successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to request return: ${error.message}`);
    },
  });
};

export const useReassignAsset = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, newEmployeeId, notes }: { id: string; newEmployeeId: string; notes?: string }) =>
      assignmentService.reassign(id, newEmployeeId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Asset reassigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reassign asset: ${error.message}`);
    },
  });
};

export const useDeleteAssignment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => assignmentService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Assignment deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete assignment: ${error.message}`);
    },
  });
};

