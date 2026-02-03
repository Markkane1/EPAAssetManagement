import { AuthPayload } from '../middleware/auth';
import { UserModel } from '../models/user.model';
import { OfficeModel } from '../models/office.model';
import { createHttpError } from './httpError';

export type AccessContext = {
  userId: string;
  role: string;
  officeId: string | null;
  isHeadofficeAdmin: boolean;
};

const OFFICE_MANAGER_ROLES = new Set(['location_admin', 'office_head']);

export function isOfficeManager(role: string) {
  return OFFICE_MANAGER_ROLES.has(role);
}

export async function resolveAccessContext(user?: AuthPayload): Promise<AccessContext> {
  if (!user) throw createHttpError(401, 'Unauthorized');
  const userDoc = await UserModel.findById(user.userId);
  if (!userDoc) throw createHttpError(401, 'Unauthorized');

  let isHeadofficeAdmin = user.role === 'super_admin';
  const officeId: string | null = userDoc.location_id ? userDoc.location_id.toString() : null;

  if (!isHeadofficeAdmin && officeId) {
    const office = await OfficeModel.findById(officeId);
    if (office?.is_headoffice && (user.role === 'admin' || user.role === 'headoffice_admin')) {
      isHeadofficeAdmin = true;
    }
  }

  return {
    userId: userDoc.id,
    role: user.role,
    officeId,
    isHeadofficeAdmin,
  };
}

export function ensureOfficeScope(ctx: AccessContext, officeId: string) {
  if (ctx.isHeadofficeAdmin) return;
  if (!ctx.officeId) throw createHttpError(403, 'User is not assigned to an office');
  if (ctx.officeId !== officeId) {
    throw createHttpError(403, 'Access restricted to assigned office');
  }
}
