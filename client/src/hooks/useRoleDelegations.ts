import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  roleDelegationService,
  type CreateRoleDelegationDto,
} from "@/services/roleDelegationService";

const QUERY_KEY = ["role-delegations"] as const;

export const useRoleDelegations = (query?: { officeId?: string; includeInactive?: boolean }) => {
  return useQuery({
    queryKey: [...QUERY_KEY, query?.officeId || "all", query?.includeInactive ? "all-status" : "active-only"],
    queryFn: () => roleDelegationService.list(query),
  });
};

export const useCreateRoleDelegation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRoleDelegationDto) => roleDelegationService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Delegation created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create delegation");
    },
  });
};

export const useRevokeRoleDelegation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => roleDelegationService.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Delegation revoked");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to revoke delegation");
    },
  });
};
