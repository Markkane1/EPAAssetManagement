import {
  LEGACY_ROLE_ALIAS_MAP,
  RUNTIME_ROLE_FALLBACK_MAP,
  USER_ROLE_VALUES,
} from '../utils/roles';

export const AUTHORIZATION_POLICY_VERSION = 1 as const;

export const AUTHORIZATION_PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

export type AuthorizationPermissionAction = (typeof AUTHORIZATION_PERMISSION_ACTIONS)[number];

export type AuthorizationPageCategory = 'Main' | 'Inventory' | 'Management' | 'System';

export type AuthorizationScopeId =
  | 'GLOBAL'
  | 'ASSIGNED_OFFICE'
  | 'HEAD_OFFICE_ONLY'
  | 'SAME_OFFICE'
  | 'SELF'
  | 'LAB_ALLOWED'
  | 'NONE';

export type AuthorizationRoleDefinition = {
  id: string;
  name: string;
  description: string;
  sourceRoles: string[];
  system: boolean;
};

export type AuthorizationPageDefinition = {
  id: string;
  name: string;
  category: AuthorizationPageCategory;
  defaultAllowedRoles: string[];
  aliases?: string[];
};

export type AuthorizationScopeDefinition = {
  id: AuthorizationScopeId;
  name: string;
  description: string;
};

export type AuthorizationResourceGroupDefinition = {
  id: string;
  name: string;
  description: string;
  routePrefixes: string[];
  pageIds: string[];
};

export type AccessPolicyScope = 'none' | 'same_office' | 'self';
export type ApprovalScope = 'same_office' | 'org_wide';

export type AccessPolicyRule = {
  allowed_roles: string[];
  denied_roles: string[];
  allow_org_admin: boolean;
  require_assigned_office: boolean;
  scope: AccessPolicyScope;
};

export type LabScopePolicy = {
  lab_only_allowed_office_types: string[];
  lab_only_allowed_user_office_types: string[];
  chemical_allowed_office_types: string[];
};

export type AccessPolicyConfig = {
  rules: Record<string, AccessPolicyRule>;
  lab_scope: LabScopePolicy;
  updated_at: string | null;
  updated_by_user_id: string | null;
};

export type ApprovalMatrixRule = {
  id: string;
  enabled: boolean;
  transaction_type: string;
  min_amount: number;
  risk_tags: string[];
  required_approvals: number;
  approver_roles: string[];
  scope: ApprovalScope;
  disallow_maker: boolean;
};

export type ApprovalMatrixConfig = {
  rules: ApprovalMatrixRule[];
  updated_at: string | null;
  updated_by_user_id: string | null;
};

export type SchedulerConfig = {
  enabled: boolean;
  maintenance_interval_minutes: number;
  threshold_interval_minutes: number;
  startup_delay_seconds: number;
  updated_at: string | null;
  updated_by_user_id: string | null;
};

export type WorkflowConfigSnapshot = {
  accessPolicies: AccessPolicyConfig;
  approvalMatrix: ApprovalMatrixConfig;
  scheduler: SchedulerConfig;
};

export const AUTHORIZATION_ROLE_DEFINITIONS: AuthorizationRoleDefinition[] = [
  {
    id: 'org_admin',
    name: 'Organization Admin',
    description: 'Full platform administration across all offices.',
    sourceRoles: ['org_admin'],
    system: true,
  },
  {
    id: 'head_office_admin',
    name: 'Head Office Admin',
    description: 'Head-office-scoped administration without global system governance.',
    sourceRoles: ['head_office_admin', 'headoffice_admin'],
    system: true,
  },
  {
    id: 'office_head',
    name: 'Office Head',
    description: 'Office-scoped operations, approvals, and team oversight.',
    sourceRoles: ['office_head'],
    system: true,
  },
  {
    id: 'caretaker',
    name: 'Caretaker',
    description: 'Office-scoped inventory and operational workflow management.',
    sourceRoles: ['caretaker'],
    system: true,
  },
  {
    id: 'employee',
    name: 'Employee',
    description: 'Self-service requisitions, returns, and assigned inventory workflows.',
    sourceRoles: ['employee'],
    system: true,
  },
  {
    id: 'storekeeper',
    name: 'Storekeeper',
    description: 'Central-store and stock operations role.',
    sourceRoles: ['storekeeper'],
    system: true,
  },
  {
    id: 'inventory_controller',
    name: 'Inventory Controller',
    description: 'Office inventory counts, reconciliation, and return workflow role.',
    sourceRoles: ['inventory_controller'],
    system: true,
  },
  {
    id: 'procurement_officer',
    name: 'Procurement Officer',
    description: 'Purchase order, vendor, and procurement oversight role.',
    sourceRoles: ['procurement_officer'],
    system: true,
  },
  {
    id: 'compliance_auditor',
    name: 'Compliance Auditor',
    description: 'Read-focused compliance, audit, and reporting visibility.',
    sourceRoles: ['compliance_auditor'],
    system: true,
  },
];

export const AUTHORIZATION_SCOPE_DEFINITIONS: AuthorizationScopeDefinition[] = [
  { id: 'GLOBAL', name: 'Global', description: 'System-wide access across all offices.' },
  { id: 'ASSIGNED_OFFICE', name: 'Assigned Office', description: 'Restricted to the actor’s assigned office.' },
  { id: 'HEAD_OFFICE_ONLY', name: 'Head Office Only', description: 'Restricted to actors assigned to the head office.' },
  { id: 'SAME_OFFICE', name: 'Same Office', description: 'Actor office must match the target office.' },
  { id: 'SELF', name: 'Self', description: 'Restricted to the acting user’s own record.' },
  { id: 'LAB_ALLOWED', name: 'Lab Allowed', description: 'Restricted by lab and chemical office type rules.' },
  { id: 'NONE', name: 'None', description: 'No additional scope constraint is required.' },
];

export const AUTHORIZATION_PAGE_DEFINITIONS: AuthorizationPageDefinition[] = [
  { id: 'dashboard', name: 'Dashboard', category: 'Main', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'procurement_officer', 'compliance_auditor'] },
  { id: 'profile', name: 'Profile', category: 'Main', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'procurement_officer', 'compliance_auditor'] },
  { id: 'notifications', name: 'Notifications', category: 'Main', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'procurement_officer', 'compliance_auditor'] },
  { id: 'my-assets', name: 'My Assets', category: 'Main', defaultAllowedRoles: ['employee'] },
  { id: 'requisitions', name: 'Requisitions', category: 'Main', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'inventory_controller'] },
  { id: 'requisitions-new', name: 'New Requisition', category: 'Main', defaultAllowedRoles: ['employee'] },
  { id: 'returns', name: 'Returns', category: 'Main', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'inventory_controller'] },
  { id: 'returns-new', name: 'New Return Request', category: 'Main', defaultAllowedRoles: ['employee'] },
  { id: 'returns-detail', name: 'Return Detail', category: 'Main', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'inventory_controller'] },
  { id: 'inventory', name: 'Inventory', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'procurement_officer', 'compliance_auditor'] },
  { id: 'assets', name: 'Assets', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker'], aliases: ['office-assets'] },
  { id: 'asset-items', name: 'Asset Items', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker'], aliases: ['office-asset-items'] },
  { id: 'assignments', name: 'Assignments', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee'] },
  { id: 'consumables', name: 'Consumables', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'caretaker', 'storekeeper', 'inventory_controller'] },
  { id: 'office-consumables', name: 'Office Consumables', category: 'Inventory', defaultAllowedRoles: ['head_office_admin', 'office_head'] },
  { id: 'transfers', name: 'Transfers', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker'] },
  { id: 'maintenance', name: 'Maintenance', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'compliance_auditor'] },
  { id: 'purchase-orders', name: 'Purchase Orders', category: 'Inventory', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'procurement_officer'] },
  { id: 'employees', name: 'Employees', category: 'Management', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker'] },
  { id: 'offices', name: 'Offices', category: 'Management', defaultAllowedRoles: ['org_admin'] },
  { id: 'rooms-sections', name: 'Rooms & Sections', category: 'Management', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker'] },
  { id: 'categories', name: 'Categories', category: 'Management', defaultAllowedRoles: ['org_admin', 'caretaker', 'storekeeper', 'inventory_controller'] },
  { id: 'vendors', name: 'Vendors', category: 'Management', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'procurement_officer'] },
  { id: 'projects', name: 'Projects', category: 'Management', defaultAllowedRoles: ['org_admin', 'caretaker', 'procurement_officer'] },
  { id: 'schemes', name: 'Schemes', category: 'Management', defaultAllowedRoles: ['org_admin', 'caretaker', 'procurement_officer'] },
  { id: 'reports', name: 'Reports', category: 'System', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'procurement_officer', 'compliance_auditor'] },
  { id: 'reports-advanced', name: 'Advanced Reports', category: 'System', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'procurement_officer', 'compliance_auditor'] },
  { id: 'compliance', name: 'Compliance', category: 'System', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'compliance_auditor'] },
  { id: 'approval-matrix', name: 'Approvals Queue', category: 'System', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'storekeeper', 'inventory_controller', 'procurement_officer', 'compliance_auditor'] },
  { id: 'settings', name: 'Settings', category: 'System', defaultAllowedRoles: ['org_admin', 'office_head'] },
  { id: 'role-delegations', name: 'Delegations', category: 'System', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker'] },
  { id: 'audit-logs', name: 'Audit Logs', category: 'System', defaultAllowedRoles: ['org_admin', 'head_office_admin', 'office_head', 'caretaker', 'employee', 'compliance_auditor'] },
  { id: 'user-permissions', name: 'User Permissions', category: 'System', defaultAllowedRoles: ['org_admin'] },
  { id: 'user-management', name: 'User Management', category: 'System', defaultAllowedRoles: ['org_admin'] },
  { id: 'user-activity', name: 'User Activity', category: 'System', defaultAllowedRoles: ['org_admin', 'compliance_auditor'] },
];

export const AUTHORIZATION_PAGE_ALIAS_GROUPS: Record<string, string> = {
  'office-assets': 'assets',
  'office-asset-items': 'asset-items',
  'office-consumables': 'consumables',
};

export const AUTHORIZATION_RESOURCE_GROUP_DEFINITIONS: AuthorizationResourceGroupDefinition[] = [
  {
    id: 'governance',
    name: 'Governance',
    description: 'Global administration, permission governance, and approval configuration.',
    routePrefixes: ['users', 'settings', 'role-delegations', 'approval-matrix', 'auth/active-role'],
    pageIds: ['settings', 'user-management', 'user-permissions', 'approval-matrix', 'role-delegations'],
  },
  {
    id: 'master_data',
    name: 'Master Data',
    description: 'Reference data used across procurement and inventory operations.',
    routePrefixes: ['offices', 'office-sub-locations', 'categories', 'vendors', 'projects', 'schemes'],
    pageIds: ['offices', 'rooms-sections', 'categories', 'vendors', 'projects', 'schemes'],
  },
  {
    id: 'asset_ops',
    name: 'Asset Operations',
    description: 'Asset, assignment, maintenance, and transfer workflows.',
    routePrefixes: ['assets', 'asset-items', 'assignments', 'maintenance', 'transfers'],
    pageIds: ['inventory', 'assets', 'asset-items', 'assignments', 'maintenance', 'transfers'],
  },
  {
    id: 'procurement',
    name: 'Procurement',
    description: 'Procurement planning and purchase order execution.',
    routePrefixes: ['purchase-orders'],
    pageIds: ['purchase-orders', 'vendors', 'projects', 'schemes'],
  },
  {
    id: 'consumables',
    name: 'Consumables',
    description: 'Consumables stock, issuance, returns, and disposal workflows.',
    routePrefixes: ['consumables'],
    pageIds: ['consumables', 'office-consumables'],
  },
  {
    id: 'staff_ops',
    name: 'Staff Operations',
    description: 'Employee management and staff self-service workflows.',
    routePrefixes: ['employees', 'requisitions', 'return-requests'],
    pageIds: ['employees', 'requisitions', 'requisitions-new', 'returns', 'returns-new', 'returns-detail', 'my-assets'],
  },
  {
    id: 'records',
    name: 'Records',
    description: 'Documented approval records and supporting recordkeeping.',
    routePrefixes: ['records'],
    pageIds: ['approval-matrix', 'audit-logs'],
  },
  {
    id: 'oversight',
    name: 'Oversight',
    description: 'Dashboards, reports, notifications, and user activity oversight.',
    routePrefixes: ['dashboard', 'activities', 'notifications', 'reports', 'observability'],
    pageIds: ['dashboard', 'profile', 'notifications', 'reports', 'reports-advanced', 'compliance', 'audit-logs', 'user-activity'],
  },
];

export const AUTHORIZATION_LEGACY_ROLE_ALIASES: Record<string, string> = {
  ...LEGACY_ROLE_ALIAS_MAP,
};

export const EMPLOYEE_RESTRICTED_PAGE_KEYS = [
  'assets',
  'asset-items',
  'office-assets',
  'office-asset-items',
  'transfers',
  'employees',
  'offices',
  'rooms-sections',
  'categories',
  'vendors',
  'projects',
  'schemes',
  'purchase-orders',
  'settings',
] as const;

export const OFFICE_ADMIN_RESTRICTED_PAGE_KEYS = [
  'categories',
  'projects',
  'schemes',
] as const;

export const OFFICE_HEAD_RESTRICTED_PAGE_KEYS = OFFICE_ADMIN_RESTRICTED_PAGE_KEYS;

export const CENTRAL_CARETAKER_ONLY_PAGE_KEYS = [
  'categories',
  'projects',
  'schemes',
] as const;

const OFFICE_ADMIN_WORKFLOW_ROLES = ['office_head', 'head_office_admin'] as const;
const OFFICE_OPERATIONS_WORKFLOW_ROLES = [
  ...OFFICE_ADMIN_WORKFLOW_ROLES,
  'caretaker',
  'storekeeper',
  'inventory_controller',
] as const;
const OFFICE_CONSUMABLE_MANAGER_ROLES = [
  ...OFFICE_ADMIN_WORKFLOW_ROLES,
  'caretaker',
] as const;
const OFFICE_APPROVER_WITH_ORG_ADMIN_ROLES = [...OFFICE_ADMIN_WORKFLOW_ROLES, 'org_admin'] as const;
const OFFICE_APPROVER_WITH_COMPLIANCE_ROLES = [...OFFICE_ADMIN_WORKFLOW_ROLES, 'compliance_auditor'] as const;

export const DEFAULT_ACCESS_POLICY_RULES: Record<string, AccessPolicyRule> = {
  'maintenance.create': {
    allowed_roles: [...OFFICE_OPERATIONS_WORKFLOW_ROLES, 'employee'],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'none',
  },
  'maintenance.manage': {
    allowed_roles: [...OFFICE_OPERATIONS_WORKFLOW_ROLES],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'none',
  },
  'transfer.create': {
    allowed_roles: [...OFFICE_OPERATIONS_WORKFLOW_ROLES],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'none',
  },
  'transfer.approve': {
    allowed_roles: [...OFFICE_ADMIN_WORKFLOW_ROLES],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'transfer.operate_source': {
    allowed_roles: [...OFFICE_OPERATIONS_WORKFLOW_ROLES],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'transfer.operate_destination': {
    allowed_roles: [...OFFICE_OPERATIONS_WORKFLOW_ROLES],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'transfer.central_store_receive': {
    allowed_roles: [],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'none',
  },
  'transfer.central_store_dispatch': {
    allowed_roles: [],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'none',
  },
  'transfer.retire': {
    allowed_roles: [],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'none',
  },
  'consumables.issue.from_office': {
    allowed_roles: [...OFFICE_CONSUMABLE_MANAGER_ROLES],
    denied_roles: ['employee'],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'consumables.issue.from_store': {
    allowed_roles: [],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'none',
  },
  'consumables.consume.source_office': {
    allowed_roles: [...OFFICE_CONSUMABLE_MANAGER_ROLES],
    denied_roles: ['employee'],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'consumables.consume.source_user': {
    allowed_roles: [...OFFICE_CONSUMABLE_MANAGER_ROLES],
    denied_roles: ['employee'],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'consumables.consume.self_user': {
    allowed_roles: ['employee'],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: false,
    scope: 'self',
  },
  'consumables.return.user_to_office.manage': {
    allowed_roles: [...OFFICE_CONSUMABLE_MANAGER_ROLES],
    denied_roles: ['employee'],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'consumables.return.user_to_office.self': {
    allowed_roles: ['employee'],
    denied_roles: [],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'self',
  },
  'consumables.return.office_to_store_lot': {
    allowed_roles: [...OFFICE_CONSUMABLE_MANAGER_ROLES],
    denied_roles: ['employee'],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'same_office',
  },
  'consumables.dispose': {
    allowed_roles: [...OFFICE_CONSUMABLE_MANAGER_ROLES],
    denied_roles: ['employee'],
    allow_org_admin: true,
    require_assigned_office: true,
    scope: 'none',
  },
};

export const DEFAULT_LAB_SCOPE_POLICY: LabScopePolicy = {
  lab_only_allowed_office_types: ['DISTRICT_LAB'],
  lab_only_allowed_user_office_types: ['DISTRICT_LAB'],
  chemical_allowed_office_types: ['DISTRICT_LAB', 'HEAD_OFFICE'],
};

export const DEFAULT_APPROVAL_MATRIX_RULES: ApprovalMatrixRule[] = [
  {
    id: 'high_value_transfer',
    enabled: true,
    transaction_type: 'TRANSFER_APPROVAL',
    min_amount: 100000,
    risk_tags: [],
    required_approvals: 2,
    approver_roles: [...OFFICE_APPROVER_WITH_ORG_ADMIN_ROLES],
    scope: 'same_office',
    disallow_maker: true,
  },
  {
    id: 'lab_or_chemical_issue',
    enabled: true,
    transaction_type: 'CONSUMABLE_ISSUE',
    min_amount: 0,
    risk_tags: ['LAB_ONLY'],
    required_approvals: 2,
    approver_roles: [...OFFICE_APPROVER_WITH_COMPLIANCE_ROLES],
    scope: 'same_office',
    disallow_maker: true,
  },
  {
    id: 'large_disposal',
    enabled: true,
    transaction_type: 'CONSUMABLE_DISPOSAL',
    min_amount: 100,
    risk_tags: [],
    required_approvals: 2,
    approver_roles: [...OFFICE_APPROVER_WITH_COMPLIANCE_ROLES],
    scope: 'same_office',
    disallow_maker: true,
  },
];

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  enabled: true,
  maintenance_interval_minutes: 15,
  threshold_interval_minutes: 30,
  startup_delay_seconds: 15,
  updated_at: null,
  updated_by_user_id: null,
};

export const AUTHORIZATION_PAGE_KEY_SET = new Set<string>(
  AUTHORIZATION_PAGE_DEFINITIONS.flatMap((page) => [page.id, ...(page.aliases || [])])
);

export const AUTHORIZATION_ROLE_ID_SET = new Set<string>(
  AUTHORIZATION_ROLE_DEFINITIONS.flatMap((role) => [role.id, ...role.sourceRoles])
);

function normalizePermissionActions(actions: AuthorizationPermissionAction[]) {
  const unique = new Set(actions);
  if (unique.has('create') || unique.has('edit') || unique.has('delete')) {
    unique.add('view');
  }
  return Array.from(unique);
}

function applyFixedRoleRestrictions(
  role: string,
  permissions: Record<string, AuthorizationPermissionAction[]>
) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'employee') {
    EMPLOYEE_RESTRICTED_PAGE_KEYS.forEach((pageKey) => {
      permissions[pageKey] = [];
    });
    return permissions;
  }
  if (normalizedRole === 'office_head' || normalizedRole === 'head_office_admin') {
    OFFICE_ADMIN_RESTRICTED_PAGE_KEYS.forEach((pageKey) => {
      permissions[pageKey] = [];
    });
    return permissions;
  }
  return permissions;
}

const ROLE_PERMISSION_ACTION_OVERRIDES: Record<
  string,
  Partial<Record<string, AuthorizationPermissionAction[]>>
> = {
  org_admin: {},
  head_office_admin: {
    'rooms-sections': ['view', 'create', 'edit', 'delete'],
    assets: ['view', 'create', 'edit', 'delete'],
    'asset-items': ['view', 'create', 'edit', 'delete'],
    consumables: ['view', 'create', 'edit', 'delete'],
    'office-consumables': ['view', 'create', 'edit', 'delete'],
    requisitions: ['view', 'edit'],
    returns: ['view', 'edit'],
    'returns-detail': ['view', 'edit'],
  },
  office_head: {
    'rooms-sections': ['view', 'create', 'edit', 'delete'],
    assets: ['view', 'create', 'edit', 'delete'],
    'asset-items': ['view', 'create', 'edit', 'delete'],
    'office-consumables': ['view', 'create', 'edit', 'delete'],
    requisitions: ['view', 'edit'],
    returns: ['view', 'edit'],
    'returns-detail': ['view', 'edit'],
  },
  caretaker: {
    'rooms-sections': ['view', 'create', 'edit', 'delete'],
    requisitions: ['view', 'edit'],
    returns: ['view', 'edit'],
    'returns-detail': ['view', 'edit'],
  },
  employee: {
    profile: ['view', 'edit'],
    notifications: ['view', 'edit'],
    'requisitions-new': ['view', 'create'],
    'returns-new': ['view', 'create'],
    'my-assets': ['view'],
  },
};

export function createEmptyAuthorizationPermissionMap() {
  const map: Record<string, AuthorizationPermissionAction[]> = {};
  AUTHORIZATION_PAGE_DEFINITIONS.forEach((page) => {
    map[page.id] = [];
    (page.aliases || []).forEach((alias) => {
      map[alias] = [];
    });
  });
  return map;
}

export function buildDefaultAuthorizationPermissionsForRole(role: string) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const permissions = createEmptyAuthorizationPermissionMap();
  if (!normalizedRole) {
    return permissions;
  }

  if (normalizedRole === 'org_admin') {
    AUTHORIZATION_PAGE_DEFINITIONS.forEach((page) => {
      permissions[page.id] = [...AUTHORIZATION_PERMISSION_ACTIONS];
      (page.aliases || []).forEach((alias) => {
        permissions[alias] = [...permissions[page.id]];
      });
    });
    return permissions;
  }

  AUTHORIZATION_PAGE_DEFINITIONS.forEach((page) => {
    if (page.defaultAllowedRoles.includes(normalizedRole)) {
      permissions[page.id] = ['view'];
    }
    (page.aliases || []).forEach((alias) => {
      permissions[alias] = [...permissions[page.id]];
    });
  });

  const overrides = ROLE_PERMISSION_ACTION_OVERRIDES[normalizedRole] || {};
  Object.entries(overrides).forEach(([pageId, actions]) => {
    permissions[pageId] = normalizePermissionActions(actions || []);
  });

  AUTHORIZATION_PAGE_DEFINITIONS.forEach((page) => {
    (page.aliases || []).forEach((alias) => {
      permissions[alias] = [...permissions[page.id]];
    });
  });

  return applyFixedRoleRestrictions(normalizedRole, permissions);
}

export function buildAuthorizationCatalog() {
  return {
    permission_actions: [...AUTHORIZATION_PERMISSION_ACTIONS],
    roles: AUTHORIZATION_ROLE_DEFINITIONS.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      source_roles: [...role.sourceRoles],
      system: role.system,
      default_permissions: buildDefaultAuthorizationPermissionsForRole(role.id),
    })),
    pages: AUTHORIZATION_PAGE_DEFINITIONS.map((page) => ({
      id: page.id,
      name: page.name,
      category: page.category,
      aliases: [...(page.aliases || [])],
      default_allowed_roles: [...page.defaultAllowedRoles],
    })),
  };
}

export function buildAuthorizationPolicyDocument() {
  return {
    version: AUTHORIZATION_POLICY_VERSION,
    permission_actions: [...AUTHORIZATION_PERMISSION_ACTIONS],
    roles: AUTHORIZATION_ROLE_DEFINITIONS.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      source_roles: [...role.sourceRoles],
      system: role.system,
      default_permissions: buildDefaultAuthorizationPermissionsForRole(role.id),
    })),
    pages: AUTHORIZATION_PAGE_DEFINITIONS.map((page) => ({
      id: page.id,
      name: page.name,
      category: page.category,
      aliases: [...(page.aliases || [])],
      default_allowed_roles: [...page.defaultAllowedRoles],
    })),
    scopes: AUTHORIZATION_SCOPE_DEFINITIONS.map((scope) => ({
      id: scope.id,
      name: scope.name,
      description: scope.description,
    })),
    resource_groups: AUTHORIZATION_RESOURCE_GROUP_DEFINITIONS.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      route_prefixes: [...group.routePrefixes],
      page_ids: [...group.pageIds],
    })),
    alias_groups: { ...AUTHORIZATION_PAGE_ALIAS_GROUPS },
    fixed_restrictions: {
      employee_restricted_page_keys: [...EMPLOYEE_RESTRICTED_PAGE_KEYS],
      office_admin_restricted_page_keys: [...OFFICE_ADMIN_RESTRICTED_PAGE_KEYS],
      office_head_restricted_page_keys: [...OFFICE_HEAD_RESTRICTED_PAGE_KEYS],
      central_caretaker_only_page_keys: [...CENTRAL_CARETAKER_ONLY_PAGE_KEYS],
    },
    workflow: {
      access_policy_defaults: Object.entries(DEFAULT_ACCESS_POLICY_RULES).reduce(
        (acc, [key, value]) => {
          acc[key] = {
            allowed_roles: [...value.allowed_roles],
            denied_roles: [...value.denied_roles],
            allow_org_admin: value.allow_org_admin,
            require_assigned_office: value.require_assigned_office,
            scope: value.scope,
          };
          return acc;
        },
        {} as Record<string, AccessPolicyRule>
      ),
      lab_scope_defaults: {
        lab_only_allowed_office_types: [...DEFAULT_LAB_SCOPE_POLICY.lab_only_allowed_office_types],
        lab_only_allowed_user_office_types: [...DEFAULT_LAB_SCOPE_POLICY.lab_only_allowed_user_office_types],
        chemical_allowed_office_types: [...DEFAULT_LAB_SCOPE_POLICY.chemical_allowed_office_types],
      },
      approval_matrix_defaults: DEFAULT_APPROVAL_MATRIX_RULES.map((rule) => ({
        ...rule,
        risk_tags: [...rule.risk_tags],
        approver_roles: [...rule.approver_roles],
      })),
      scheduler_defaults: { ...DEFAULT_SCHEDULER_CONFIG },
    },
    migration: {
      canonical_roles: [...USER_ROLE_VALUES],
      legacy_role_aliases: { ...AUTHORIZATION_LEGACY_ROLE_ALIASES },
      runtime_role_fallbacks: { ...RUNTIME_ROLE_FALLBACK_MAP },
      persisted_policy_fields: ['role_permissions', 'access_policies', 'approval_matrix'],
      head_office_admin_promotion_rule:
        'Users assigned to a HEAD_OFFICE office and acting as office_head can be migrated to head_office_admin.',
    },
  };
}
