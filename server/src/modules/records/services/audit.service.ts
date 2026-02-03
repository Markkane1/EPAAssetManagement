import { AuditLogModel } from '../../../models/auditLog.model';
import type { ClientSession } from 'mongoose';
import type { RequestContext } from '../../../utils/scope';

interface AuditPayload {
  ctx: RequestContext;
  action: string;
  entityType: string;
  entityId: string;
  officeId: string;
  diff?: Record<string, unknown> | null;
  session?: ClientSession;
}

export async function logAudit({ ctx, action, entityType, entityId, officeId, diff, session }: AuditPayload) {
  await AuditLogModel.create(
    [
      {
        actor_user_id: ctx.userId,
        office_id: officeId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        timestamp: new Date(),
        diff: diff || null,
      },
    ],
    { session }
  );
}
