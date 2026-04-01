import { AuthPayload } from '../middleware/auth';
import { UserModel } from '../models/user.model';
import { createHttpError } from './httpError';
import { OFFICE_MANAGER_ROLE_VALUES } from './roles';

export type AccessContext = {
  userId: string;
  role: string;
  officeId: string | null;
  isOrgAdmin: boolean;
};

const OFFICE_MANAGER_ROLES = new Set<string>(OFFICE_MANAGER_ROLE_VALUES);

export function isOfficeManager(role: string) {
  return OFFICE_MANAGER_ROLES.has(role);
}

export async function resolveAccessContext(user?: AuthPayload): Promise<AccessContext> {
  if (!user) throw createHttpError(401, 'Unauthorized');
  const userDoc = await UserModel.findById(user.userId, { location_id: 1 }).lean() as
    | { _id: unknown; location_id?: unknown }
    | null;
  if (!userDoc) throw createHttpError(401, 'Unauthorized');

  const officeId: string | null = userDoc.location_id
    ? String(userDoc.location_id)
    : user.locationId || null;
  const isOrgAdmin = Boolean(user.isOrgAdmin || user.role === 'org_admin');

  return {
    userId: String(userDoc._id),
    role: user.role,
    officeId,
    isOrgAdmin,
  };
}

export function ensureOfficeScope(ctx: AccessContext, officeId: string) {
  if (ctx.isOrgAdmin) return;
  if (!ctx.officeId) throw createHttpError(403, 'User is not assigned to an office');
  if (ctx.officeId !== officeId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }
}
