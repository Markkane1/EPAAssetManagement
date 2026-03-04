import type { ClientSession } from 'mongoose';
import type { AuthRequest } from '../../../middleware/auth';
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
