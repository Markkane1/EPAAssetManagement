import { Types } from 'mongoose';
import { SystemSettingsModel } from '../models/systemSettings.model';
import {
  DEFAULT_ACCESS_POLICY_RULES,
  DEFAULT_APPROVAL_MATRIX_RULES,
  DEFAULT_LAB_SCOPE_POLICY,
  DEFAULT_SCHEDULER_CONFIG,
  type AccessPolicyConfig,
  type AccessPolicyRule,
  type AccessPolicyScope,
  type ApprovalMatrixConfig,
  type ApprovalMatrixRule,
  type ApprovalScope,
  type LabScopePolicy,
  type SchedulerConfig,
  type WorkflowConfigSnapshot,
} from '../config/authorizationPolicy';
import { normalizeRoles as normalizeKnownRoles } from '../utils/roles';

export type {
  AccessPolicyConfig,
  AccessPolicyRule,
  AccessPolicyScope,
  ApprovalMatrixConfig,
  ApprovalMatrixRule,
  ApprovalScope,
  LabScopePolicy,
  SchedulerConfig,
  WorkflowConfigSnapshot,
};

const CONFIG_CACHE_TTL_MS = 30_000;
let cached: { expiresAt: number; snapshot: WorkflowConfigSnapshot } | null = null;

function asPositiveInt(value: unknown, fallback: number, max = 10_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function cloneAccessPolicyRule(rule: AccessPolicyRule): AccessPolicyRule {
  return {
    allowed_roles: [...rule.allowed_roles],
    denied_roles: [...rule.denied_roles],
    allow_org_admin: rule.allow_org_admin,
    require_assigned_office: rule.require_assigned_office,
    scope: rule.scope,
  };
}

function cloneApprovalRule(rule: ApprovalMatrixRule): ApprovalMatrixRule {
  return {
    ...rule,
    risk_tags: [...rule.risk_tags],
    approver_roles: [...rule.approver_roles],
  };
}

function normalizeRoleList(value: unknown, fallback: string[] = []) {
  const normalized = normalizeKnownRoles(Array.isArray(value) ? value : fallback, null, { allowEmpty: true })
    .flatMap((role) =>
      role === 'office_head' || role === 'head_office_admin'
        ? ['office_head', 'head_office_admin']
        : [role]
    );
  return Array.from(new Set(normalized));
}

function normalizeRiskTags(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((entry) => String(entry || '').trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeOfficeTypeList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((entry) => String(entry || '').trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeAccessScope(value: unknown, fallback: AccessPolicyScope): AccessPolicyScope {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'same_office' || normalized === 'self' || normalized === 'none') {
    return normalized;
  }
  return fallback;
}

function normalizeApprovalScope(value: unknown, fallback: ApprovalScope): ApprovalScope {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'same_office' || normalized === 'org_wide') {
    return normalized;
  }
  return fallback;
}

function sanitizeAccessPolicyRule(raw: unknown, fallback: AccessPolicyRule): AccessPolicyRule {
  if (!raw || typeof raw !== 'object') {
    return cloneAccessPolicyRule(fallback);
  }
  const row = raw as Record<string, unknown>;
  return {
    allowed_roles: normalizeRoleList(row.allowed_roles, fallback.allowed_roles),
    denied_roles: normalizeRoleList(row.denied_roles, fallback.denied_roles),
    allow_org_admin: asBoolean(row.allow_org_admin, fallback.allow_org_admin),
    require_assigned_office: asBoolean(row.require_assigned_office, fallback.require_assigned_office),
    scope: normalizeAccessScope(row.scope, fallback.scope),
  };
}

function sanitizeAccessPolicies(raw: unknown): AccessPolicyConfig {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const inputRules = row.rules && typeof row.rules === 'object'
    ? (row.rules as Record<string, unknown>)
    : {};

  const rules: Record<string, AccessPolicyRule> = {};
  for (const [action, defaultRule] of Object.entries(DEFAULT_ACCESS_POLICY_RULES)) {
    rules[action] = sanitizeAccessPolicyRule(inputRules[action], defaultRule);
  }

  const labScopeRaw = row.lab_scope && typeof row.lab_scope === 'object'
    ? (row.lab_scope as Record<string, unknown>)
    : {};

  const lab_scope: LabScopePolicy = {
    lab_only_allowed_office_types: normalizeOfficeTypeList(
      labScopeRaw.lab_only_allowed_office_types,
      DEFAULT_LAB_SCOPE_POLICY.lab_only_allowed_office_types
    ),
    lab_only_allowed_user_office_types: normalizeOfficeTypeList(
      labScopeRaw.lab_only_allowed_user_office_types,
      DEFAULT_LAB_SCOPE_POLICY.lab_only_allowed_user_office_types
    ),
    chemical_allowed_office_types: normalizeOfficeTypeList(
      labScopeRaw.chemical_allowed_office_types,
      DEFAULT_LAB_SCOPE_POLICY.chemical_allowed_office_types
    ),
  };

  const updatedBy = String(row.updated_by_user_id || '').trim();
  return {
    rules,
    lab_scope,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    updated_by_user_id: Types.ObjectId.isValid(updatedBy) ? updatedBy : null,
  };
}

function sanitizeApprovalRule(raw: unknown, fallback?: ApprovalMatrixRule): ApprovalMatrixRule | null {
  if (!raw || typeof raw !== 'object') return fallback ? cloneApprovalRule(fallback) : null;
  const row = raw as Record<string, unknown>;

  const id = String(row.id || fallback?.id || '').trim();
  const transactionType = String(row.transaction_type || fallback?.transaction_type || '').trim().toUpperCase();
  if (!id || !transactionType) return null;

  return {
    id,
    enabled: asBoolean(row.enabled, fallback?.enabled ?? true),
    transaction_type: transactionType,
    min_amount: Math.max(0, Number(row.min_amount ?? fallback?.min_amount ?? 0) || 0),
    risk_tags: normalizeRiskTags(row.risk_tags, fallback?.risk_tags || []),
    required_approvals: asPositiveInt(row.required_approvals, fallback?.required_approvals || 1, 10),
    approver_roles: normalizeRoleList(row.approver_roles, fallback?.approver_roles || []),
    scope: normalizeApprovalScope(row.scope, fallback?.scope || 'same_office'),
    disallow_maker: asBoolean(row.disallow_maker, fallback?.disallow_maker ?? true),
  };
}

function sanitizeApprovalMatrix(raw: unknown): ApprovalMatrixConfig {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const sourceRules = Array.isArray(row.rules) ? row.rules : [];

  let rules = sourceRules
    .map((entry) => sanitizeApprovalRule(entry))
    .filter((entry): entry is ApprovalMatrixRule => Boolean(entry));

  if (rules.length === 0) {
    rules = DEFAULT_APPROVAL_MATRIX_RULES.map((rule) => cloneApprovalRule(rule));
  }

  const updatedBy = String(row.updated_by_user_id || '').trim();
  return {
    rules,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    updated_by_user_id: Types.ObjectId.isValid(updatedBy) ? updatedBy : null,
  };
}

function sanitizeScheduler(raw: unknown): SchedulerConfig {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const updatedBy = String(row.updated_by_user_id || '').trim();
  return {
    enabled: asBoolean(row.enabled, DEFAULT_SCHEDULER_CONFIG.enabled),
    maintenance_interval_minutes: asPositiveInt(
      row.maintenance_interval_minutes,
      DEFAULT_SCHEDULER_CONFIG.maintenance_interval_minutes,
      24 * 60
    ),
    threshold_interval_minutes: asPositiveInt(
      row.threshold_interval_minutes,
      DEFAULT_SCHEDULER_CONFIG.threshold_interval_minutes,
      24 * 60
    ),
    startup_delay_seconds: asPositiveInt(
      row.startup_delay_seconds,
      DEFAULT_SCHEDULER_CONFIG.startup_delay_seconds,
      3600
    ),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    updated_by_user_id: Types.ObjectId.isValid(updatedBy) ? updatedBy : null,
  };
}

export function getDefaultAccessPolicyConfig() {
  return sanitizeAccessPolicies({});
}

export function getDefaultApprovalMatrixConfig() {
  return sanitizeApprovalMatrix({});
}

export function getDefaultSchedulerConfig() {
  return sanitizeScheduler({});
}

export function invalidateWorkflowConfigCache() {
  cached = null;
}

export async function getWorkflowConfigSnapshot(options?: { forceRefresh?: boolean }) {
  const now = Date.now();
  if (!options?.forceRefresh && cached && cached.expiresAt > now) {
    return cached.snapshot;
  }

  const settings: any = await SystemSettingsModel.findOne(
    {},
    { access_policies: 1, approval_matrix: 1, scheduler: 1 }
  )
    .lean()
    .exec();

  const snapshot: WorkflowConfigSnapshot = {
    accessPolicies: sanitizeAccessPolicies(settings?.access_policies),
    approvalMatrix: sanitizeApprovalMatrix(settings?.approval_matrix),
    scheduler: sanitizeScheduler(settings?.scheduler),
  };

  cached = {
    snapshot,
    expiresAt: now + CONFIG_CACHE_TTL_MS,
  };
  return snapshot;
}
