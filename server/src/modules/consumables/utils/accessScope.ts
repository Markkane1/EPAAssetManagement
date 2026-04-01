import type { ClientSession } from 'mongoose';
import type { AuthRequest } from '../../../middleware/auth';
import { EmployeeModel } from '../../../models/employee.model';
import { OfficeSubLocationModel } from '../../../models/officeSubLocation.model';
import { createHttpError } from './httpError';
import {
  officeTypeSupportsLabOnly,
  resolveConsumableCategoryScopeByCategoryId,
  resolveConsumableCategoryScopeForItem,
  resolveLabOnlyCategoryIds,
  resolveLabOnlyConsumableItemIds,
  resolveOfficeTypeById,
} from './labScope';

export type ConsumableRequestScope = {
  isGlobal: boolean;
  role: string;
  locationId: string | null;
  canAccessLabOnly: boolean;
};

export type ConsumableHolderType = 'OFFICE' | 'STORE' | 'EMPLOYEE' | 'SUB_LOCATION';

export type OfficeScopedHolderIds = {
  officeId: string;
  subLocationIds: string[];
  employeeIds: string[];
};

export type EmployeeScopedHolderIds = {
  employeeId: string;
  subLocationIds: string[];
};

function resolveEmployeeAllowedSubLocationIds(employee: {
  default_sub_location_id?: unknown;
  allowed_sub_location_ids?: unknown[];
} | null | undefined) {
  const ids = new Set<string>();
  const defaultSubLocationId = employee?.default_sub_location_id
    ? String(employee.default_sub_location_id)
    : '';
  if (defaultSubLocationId) ids.add(defaultSubLocationId);
  const allowed = Array.isArray(employee?.allowed_sub_location_ids)
    ? employee.allowed_sub_location_ids
    : [];
  for (const entry of allowed) {
    const id = String(entry || '').trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export async function resolveConsumableRequestScope(
  req: Pick<AuthRequest, 'user'>,
  session?: ClientSession
): Promise<ConsumableRequestScope> {
  if (!req.user) {
    throw createHttpError(401, 'Unauthorized');
  }
  const role = String(req.user.role || '');
  const isGlobal = Boolean(req.user.isOrgAdmin || role === 'org_admin');
  const locationId = req.user.locationId ? String(req.user.locationId) : null;
  let canAccessLabOnly = isGlobal;
  if (!canAccessLabOnly && locationId) {
    const officeType = await resolveOfficeTypeById(locationId, session);
    canAccessLabOnly = officeTypeSupportsLabOnly(officeType);
  }
  return {
    isGlobal,
    role,
    locationId,
    canAccessLabOnly,
  };
}

export function ensureScopeOfficeAccess(scope: ConsumableRequestScope, officeId: unknown, message = 'Forbidden') {
  if (scope.isGlobal) return;
  if (!scope.locationId || !officeId || String(officeId) !== scope.locationId) {
    throw createHttpError(403, message);
  }
}

export async function resolveOfficeScopedHolderIds(
  locationId: string,
  session?: ClientSession
): Promise<OfficeScopedHolderIds> {
  const [subLocations, employees] = await Promise.all([
    OfficeSubLocationModel.find({ office_id: locationId, is_active: { $ne: false } }, { _id: 1 })
      .session(session || null)
      .lean(),
    EmployeeModel.find({ location_id: locationId, is_active: { $ne: false } }, { _id: 1 })
      .session(session || null)
      .lean(),
  ]);

  return {
    officeId: locationId,
    subLocationIds: subLocations.map((row) => String(row._id)),
    employeeIds: employees.map((row) => String(row._id)),
  };
}

export function buildOfficeScopedBalanceFilter(scope: OfficeScopedHolderIds) {
  const filters: Record<string, unknown>[] = [{ holder_type: 'OFFICE', holder_id: scope.officeId }];
  if (scope.subLocationIds.length > 0) {
    filters.push({ holder_type: 'SUB_LOCATION', holder_id: { $in: scope.subLocationIds } });
  }
  if (scope.employeeIds.length > 0) {
    filters.push({ holder_type: 'EMPLOYEE', holder_id: { $in: scope.employeeIds } });
  }
  return { $or: filters };
}

export function isHolderInOfficeScope(
  holderType: ConsumableHolderType,
  holderId: string,
  scope: OfficeScopedHolderIds
) {
  if (holderType === 'STORE') return false;
  if (holderType === 'OFFICE') return holderId === scope.officeId;
  if (holderType === 'SUB_LOCATION') return scope.subLocationIds.includes(holderId);
  if (holderType === 'EMPLOYEE') return scope.employeeIds.includes(holderId);
  return false;
}

export async function resolveEmployeeScopedHolderIds(
  userId: string,
  session?: ClientSession
): Promise<EmployeeScopedHolderIds> {
  const employee = await EmployeeModel.findOne({ user_id: userId, is_active: { $ne: false } })
    .sort({ created_at: -1 })
    .session(session || null);
  if (!employee) {
    throw createHttpError(403, 'Employee profile is required');
  }
  return {
    employeeId: String(employee._id),
    subLocationIds: resolveEmployeeAllowedSubLocationIds(employee),
  };
}

export function buildEmployeeScopedBalanceFilter(scope: EmployeeScopedHolderIds) {
  const filters: Record<string, unknown>[] = [{ holder_type: 'EMPLOYEE', holder_id: scope.employeeId }];
  if (scope.subLocationIds.length > 0) {
    filters.push({ holder_type: 'SUB_LOCATION', holder_id: { $in: scope.subLocationIds } });
  }
  return { $or: filters };
}

export function isHolderInEmployeeScope(
  holderType: ConsumableHolderType,
  holderId: string,
  scope: EmployeeScopedHolderIds
) {
  if (holderType === 'EMPLOYEE') return holderId === scope.employeeId;
  if (holderType === 'SUB_LOCATION') return scope.subLocationIds.includes(holderId);
  return false;
}

export async function ensureScopeItemAccess(
  scope: ConsumableRequestScope,
  itemOrId: string | { category_id?: unknown } | null | undefined,
  session?: ClientSession
) {
  if (scope.canAccessLabOnly) return;
  const categoryScope = await resolveConsumableCategoryScopeForItem(
    itemOrId as string | { category_id?: unknown },
    session
  );
  if (categoryScope === 'LAB_ONLY') {
    throw createHttpError(403, 'LAB_ONLY consumables are restricted to lab-enabled offices');
  }
}

export async function ensureScopeCategoryAccess(
  scope: ConsumableRequestScope,
  categoryId: unknown,
  session?: ClientSession
) {
  if (scope.canAccessLabOnly) return;
  const categoryScope = await resolveConsumableCategoryScopeByCategoryId(
    categoryId,
    session
  );
  if (categoryScope === 'LAB_ONLY') {
    throw createHttpError(403, 'LAB_ONLY consumables are restricted to lab-enabled offices');
  }
}

export async function resolveScopeLabOnlyRestrictions(
  scope: ConsumableRequestScope,
  session?: ClientSession
) {
  if (scope.canAccessLabOnly) {
    return {
      labOnlyCategoryIds: [] as any[],
      labOnlyItemIds: [] as any[],
    };
  }
  const [labOnlyCategoryIds, labOnlyItemIds] = await Promise.all([
    resolveLabOnlyCategoryIds(session),
    resolveLabOnlyConsumableItemIds(session),
  ]);
  return {
    labOnlyCategoryIds,
    labOnlyItemIds,
  };
}
