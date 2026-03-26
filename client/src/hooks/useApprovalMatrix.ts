import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_CONFIG } from "@/config/api.config";
import {
  approvalMatrixService,
  type ApprovalMatrixDecision,
} from "@/services/approvalMatrixService";

const { queryKeys, query } = API_CONFIG;
const { live } = query.profiles;

export const usePendingApprovalMatrixRequests = () => {
  return useQuery({
    queryKey: [...queryKeys.approvalMatrix, "pending"],
    queryFn: approvalMatrixService.getPending,
    staleTime: live.staleTime,
    refetchOnWindowFocus: live.refetchOnWindowFocus,
  });
};

export const useDecideApprovalMatrixRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, decision, notes }: { id: string; decision: ApprovalMatrixDecision; notes?: string }) =>
      approvalMatrixService.decide(id, { decision, notes }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.approvalMatrix] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.notifications] });
      toast.success(
        variables.decision === "APPROVED"
          ? "Approval request approved."
          : "Approval request rejected."
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to decide approval request.");
    },
  });
};
