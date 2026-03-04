import { EmployeeModel } from '../../../models/employee.model';
import { OfficeSubLocationModel } from '../../../models/officeSubLocation.model';
import { UserModel } from '../../../models/user.model';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from '../../../services/notification.service';

type HolderRef = {
  holderType?: string | null;
  holderId?: string | null;
};

function isObjectId(value: unknown) {
  return /^[0-9a-fA-F]{24}$/.test(String(value || '').trim());
}

function uniqueObjectIdStrings(list: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      list
        .map((entry) => String(entry || '').trim())
        .filter((entry) => isObjectId(entry))
    )
  );
}

function normalizeHolderType(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

async function resolveOfficeIdForHolder(holderTypeRaw: unknown, holderIdRaw: unknown) {
  const holderType = normalizeHolderType(holderTypeRaw);
  const holderId = String(holderIdRaw || '').trim();
  if (!holderType || !isObjectId(holderId)) return null;

  if (holderType === 'OFFICE') {
    return holderId;
  }
  if (holderType === 'STORE') {
    return null;
  }
  if (holderType === 'SUB_LOCATION') {
    const subLocation: any = await OfficeSubLocationModel.findById(holderId, { office_id: 1 }).lean();
    const officeId = subLocation?.office_id ? String(subLocation.office_id) : null;
    return officeId && isObjectId(officeId) ? officeId : null;
  }
  if (holderType === 'EMPLOYEE') {
    const employee: any = await EmployeeModel.findById(holderId, { location_id: 1 }).lean();
    const officeId = employee?.location_id ? String(employee.location_id) : null;
    return officeId && isObjectId(officeId) ? officeId : null;
  }
  if (holderType === 'USER') {
    const user: any = await UserModel.findById(holderId, { location_id: 1 }).lean();
    const officeId = user?.location_id ? String(user.location_id) : null;
    return officeId && isObjectId(officeId) ? officeId : null;
  }
  return null;
}

export async function resolveOfficeIdsFromHolders(holders: HolderRef[]) {
  if (!Array.isArray(holders) || holders.length === 0) return [] as string[];
  const officeIds = await Promise.all(
    holders.map((holder) => resolveOfficeIdForHolder(holder.holderType, holder.holderId))
  );
  return uniqueObjectIdStrings(officeIds);
}

export async function resolveOfficeIdsFromTransactions(transactions: any | any[]) {
  const rows = Array.isArray(transactions) ? transactions : transactions ? [transactions] : [];
  if (rows.length === 0) return [] as string[];
  const holders: HolderRef[] = [];
  for (const row of rows) {
    holders.push(
      {
        holderType: row?.from_holder_type,
        holderId: row?.from_holder_id ? String(row.from_holder_id) : null,
      },
      {
        holderType: row?.to_holder_type,
        holderId: row?.to_holder_id ? String(row.to_holder_id) : null,
      }
    );
  }
  return resolveOfficeIdsFromHolders(holders);
}

export async function dispatchConsumableWorkflowNotifications(input: {
  officeIds: Array<string | null | undefined>;
  consumableItemIds: Array<string | null | undefined>;
  type:
    | 'CONSUMABLE_RECEIVED'
    | 'CONSUMABLE_TRANSFERRED'
    | 'CONSUMABLE_CONSUMED'
    | 'CONSUMABLE_ADJUSTED'
    | 'CONSUMABLE_DISPOSED'
    | 'CONSUMABLE_RETURNED'
    | 'CONSUMABLE_OPENING_BALANCE'
    | 'CONSUMABLE_ISSUED';
  title: string;
  message: string;
  includeUserIds?: Array<string | null | undefined>;
  excludeUserIds?: Array<string | null | undefined>;
  dedupeWindowHours?: number;
}) {
  const officeIds = uniqueObjectIdStrings(input.officeIds);
  const consumableItemIds = uniqueObjectIdStrings(input.consumableItemIds);
  if (officeIds.length === 0 || consumableItemIds.length === 0) return;

  const includeUserIds = uniqueObjectIdStrings(input.includeUserIds || []);
  const excludeUserIds = uniqueObjectIdStrings(input.excludeUserIds || []);
  const recipients = await resolveNotificationRecipientsByOffice({
    officeIds,
    includeOrgAdmins: true,
    includeRoles: ['office_head', 'caretaker'],
    includeUserIds,
    excludeUserIds,
  });
  if (recipients.length === 0) return;

  const officeId = officeIds[0];
  await createBulkNotifications(
    recipients.flatMap((recipientUserId) =>
      consumableItemIds.map((consumableItemId) => ({
        recipientUserId,
        officeId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: 'ConsumableItem',
        entityId: consumableItemId,
        dedupeWindowHours: input.dedupeWindowHours ?? 12,
      }))
    )
  );
}

