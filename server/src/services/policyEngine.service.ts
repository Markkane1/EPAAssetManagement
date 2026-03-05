import { createHttpError } from '../utils/httpError';
import { hasRoleCapability } from '../utils/roles';
import { getWorkflowConfigSnapshot, type AccessPolicyRule } from './workflowConfig.service';

export type PolicyActor = {
  userId: string;
  role: string;
  roles?: string[];
  officeId?: string | null;
  isOrgAdmin?: boolean;
};

type AccessPolicyInput = {
  action: string;
  actor: PolicyActor;
  targetOfficeId?: string | null;
  subjectUserId?: string | null;
  errorMessage?: string;
};

function normalizeRoles(actor: PolicyActor) {
  const list = Array.isArray(actor.roles) && actor.roles.length > 0
    ? actor.roles
    : [actor.role];
  return list
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);
}

function isRuleDeniedByRole(rule: AccessPolicyRule, roles: string[]) {
  const denied = rule.denied_roles || [];
  if (denied.length === 0) return false;
  return hasRoleCapability(roles, denied);
}

function isRuleAllowedByRole(rule: AccessPolicyRule, roles: string[]) {
  const allowed = rule.allowed_roles || [];
  if (allowed.length === 0) return false;
  return hasRoleCapability(roles, allowed);
}

function ensureScope(rule: AccessPolicyRule, input: AccessPolicyInput) {
  if (rule.scope === 'none') return;

  if (rule.scope === 'same_office') {
    const actorOfficeId = String(input.actor.officeId || '').trim();
    const targetOfficeId = String(input.targetOfficeId || '').trim();
    if (!actorOfficeId || !targetOfficeId || actorOfficeId !== targetOfficeId) {
      throw createHttpError(403, input.errorMessage || 'Access restricted to assigned office');
    }
    return;
  }

  if (rule.scope === 'self') {
    const actorUserId = String(input.actor.userId || '').trim();
    const subjectUserId = String(input.subjectUserId || '').trim();
    if (!actorUserId || !subjectUserId || actorUserId !== subjectUserId) {
      throw createHttpError(403, input.errorMessage || 'Action is restricted to own profile');
    }
  }
}

export async function enforceAccessPolicy(input: AccessPolicyInput) {
  const action = String(input.action || '').trim();
  if (!action) {
    throw createHttpError(500, 'Policy action is required');
  }

  const config = await getWorkflowConfigSnapshot();
  const rule = config.accessPolicies.rules[action];
  if (!rule) {
    throw createHttpError(403, input.errorMessage || 'Action not permitted by policy');
  }

  const isOrgAdmin = Boolean(input.actor.isOrgAdmin);
  if (rule.allow_org_admin && isOrgAdmin) {
    return rule;
  }

  const roles = normalizeRoles(input.actor);
  if (roles.length === 0) {
    throw createHttpError(403, input.errorMessage || 'Unauthorized role context');
  }

  if (isRuleDeniedByRole(rule, roles)) {
    throw createHttpError(403, input.errorMessage || 'Action not permitted by policy');
  }
  if (!isRuleAllowedByRole(rule, roles)) {
    throw createHttpError(403, input.errorMessage || 'Action not permitted by policy');
  }
  if (rule.require_assigned_office && !String(input.actor.officeId || '').trim()) {
    throw createHttpError(403, input.errorMessage || 'User is not assigned to an office');
  }

  ensureScope(rule, input);
  return rule;
}

export async function assertLabOnlyOfficeType(officeType: unknown, forUserDestination = false) {
  const normalizedOfficeType = String(officeType || '').trim().toUpperCase();
  const config = await getWorkflowConfigSnapshot();
  const allowed = forUserDestination
    ? config.accessPolicies.lab_scope.lab_only_allowed_user_office_types
    : config.accessPolicies.lab_scope.lab_only_allowed_office_types;
  if (!allowed.includes(normalizedOfficeType)) {
    throw createHttpError(400, 'LAB_ONLY consumables are not permitted for this office type');
  }
}

export async function assertChemicalOfficeType(officeType: unknown) {
  const normalizedOfficeType = String(officeType || '').trim().toUpperCase();
  const config = await getWorkflowConfigSnapshot();
  const allowed = config.accessPolicies.lab_scope.chemical_allowed_office_types;
  if (!allowed.includes(normalizedOfficeType)) {
    throw createHttpError(400, 'Chemical operations are not permitted for this office type');
  }
}
