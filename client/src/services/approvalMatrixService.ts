import api from "@/lib/api";

export type ApprovalMatrixDecision = "APPROVED" | "REJECTED";

export interface ApprovalMatrixDecisionEntry {
  approver_user_id: string;
  decision: "Approved" | "Rejected";
  decided_at: string;
  notes?: string | null;
}

export interface ApprovalMatrixRuleSnapshot {
  id: string;
  transaction_type: string;
  min_amount: number;
  risk_tags: string[];
  required_approvals: number;
  approver_roles: string[];
  scope: "same_office" | "org_wide";
  disallow_maker: boolean;
}

export interface ApprovalMatrixRequest {
  id: string;
  transaction_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  office_id?: string | null;
  maker_user_id: string;
  amount: number;
  risk_tags: string[];
  payload_digest: string;
  status: "Pending" | "Approved" | "Rejected" | "Executed" | "Cancelled";
  requested_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  executed_at?: string | null;
  required_approvals: number;
  approvals: ApprovalMatrixDecisionEntry[];
  rule_snapshot: ApprovalMatrixRuleSnapshot;
  created_at?: string;
  updated_at?: string;
}

export interface DecideApprovalMatrixRequestDto {
  decision: ApprovalMatrixDecision;
  notes?: string;
}

export const approvalMatrixService = {
  getPending: () => api.get<ApprovalMatrixRequest[]>("/approval-matrix/pending"),
  decide: (id: string, payload: DecideApprovalMatrixRequestDto) =>
    api.post<ApprovalMatrixRequest>(`/approval-matrix/${id}/decide`, payload),
};

export default approvalMatrixService;
