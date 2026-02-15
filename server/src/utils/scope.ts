import type { AuthRequest } from '../middleware/auth';
import { UserModel } from '../models/user.model';
import { createHttpError } from './httpError';

export type RequestContext = {
  userId: string;
  role: string;
  locationId: string | null;
  isHeadoffice: boolean;
};

type ContextCarrier = AuthRequest & { __requestContext?: RequestContext };

export async function getRequestContext(req: AuthRequest): Promise<RequestContext> {
  const cached = (req as ContextCarrier).__requestContext;
  if (cached) return cached;

  if (!req.user) {
    throw createHttpError(401, 'Unauthorized');
  }

  let locationId: string | null = req.user.locationId ?? null;
  let isHeadoffice: boolean = req.user.isOrgAdmin ?? req.user.role === 'org_admin';

  if (locationId === null || req.user.locationId === undefined) {
    const userDoc = await UserModel.findById(req.user.userId);
    if (!userDoc) {
      throw createHttpError(401, 'Unauthorized');
    }
    locationId = userDoc.location_id ? userDoc.location_id.toString() : null;
  }

  const context: RequestContext = {
    userId: req.user.userId,
    role: req.user.role,
    locationId,
    isHeadoffice,
  };

  (req as ContextCarrier).__requestContext = context;
  return context;
}

export function buildOfficeFilter(
  ctx: RequestContext,
  field: 'office_id' | 'location_id' = 'office_id'
) {
  if (ctx.isHeadoffice) return null;
  if (!ctx.locationId) {
    throw createHttpError(403, 'User is not assigned to an office');
  }
  return { [field]: ctx.locationId };
}
