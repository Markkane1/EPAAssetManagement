import api from "@/lib/api";

export interface RoleDelegationRecord {
  id: string;
  delegator_user_id: string;
  delegate_user_id: string;
  office_id: string;
  delegated_roles: string[];
  starts_at: string;
  ends_at: string;
  reason: string | null;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  revoked_at?: string | null;
  revoked_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
  is_currently_active?: boolean;
  delegator_email?: string | null;
  delegate_email?: string | null;
  revoked_by_email?: string | null;
}

export interface CreateRoleDelegationDto {
  delegateUserId: string;
  officeId?: string;
  delegatedRoles: string[];
  startsAt: string;
  endsAt: string;
  reason?: string;
}

export const roleDelegationService = {
  list: (query?: { officeId?: string; includeInactive?: boolean }) => {
    const params = new URLSearchParams();
    if (query?.officeId) params.set("officeId", query.officeId);
    if (query?.includeInactive) params.set("includeInactive", "true");
    return api.get<RoleDelegationRecord[]>(`/role-delegations${params.toString() ? `?${params.toString()}` : ""}`);
  },
  create: (payload: CreateRoleDelegationDto) => api.post<RoleDelegationRecord>("/role-delegations", payload),
  revoke: (id: string) => api.post<RoleDelegationRecord>(`/role-delegations/${id}/revoke`),
};

export default roleDelegationService;
