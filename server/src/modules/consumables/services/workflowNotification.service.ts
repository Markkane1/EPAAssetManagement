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

async function buildOfficeIdMapsByHolderType(holders: HolderRef[]) {
  const officeIds = uniqueObjectIdStrings(
    holders
      .filter((holder) => normalizeHolderType(holder.holderType) === 'OFFICE')
      .map((holder) => holder.holderId || null)
  );
  const employeeIds = uniqueObjectIdStrings(
    holders
      .filter((holder) => normalizeHolderType(holder.holderType) === 'EMPLOYEE')
      .map((holder) => holder.holderId || null)
  );
  const subLocationIds = uniqueObjectIdStrings(
    holders
      .filter((holder) => normalizeHolderType(holder.holderType) === 'SUB_LOCATION')
      .map((holder) => holder.holderId || null)
  );
  const userIds = uniqueObjectIdStrings(
    holders
      .filter((holder) => normalizeHolderType(holder.holderType) === 'USER')
      .map((holder) => holder.holderId || null)
  );

  const [employees, subLocations, users] = await Promise.all([
    employeeIds.length > 0
      ? EmployeeModel.find({ _id: { $in: employeeIds } }, { location_id: 1 }).lean()
      : Promise.resolve([]),
    subLocationIds.length > 0
      ? OfficeSubLocationModel.find({ _id: { $in: subLocationIds } }, { office_id: 1 }).lean()
      : Promise.resolve([]),
    userIds.length > 0
      ? UserModel.find({ _id: { $in: userIds } }, { location_id: 1 }).lean()
      : Promise.resolve([]),
  ]);

  return {
    officeByOfficeId: new Map(officeIds.map((officeId) => [officeId, officeId])),
    officeByEmployeeId: new Map(
      employees.map((employee: any) => [
        String(employee._id),
        employee?.location_id && isObjectId(String(employee.location_id)) ? String(employee.location_id) : null,
      ])
    ),
    officeBySubLocationId: new Map(
      subLocations.map((subLocation: any) => [
        String(subLocation._id),
        subLocation?.office_id && isObjectId(String(subLocation.office_id)) ? String(subLocation.office_id) : null,
      ])
    ),
    officeByUserId: new Map(
      users.map((user: any) => [
        String(user._id),
        user?.location_id && isObjectId(String(user.location_id)) ? String(user.location_id) : null,
      ])
    ),
  };
}

export async function resolveOfficeIdsFromHolders(holders: HolderRef[]) {
  if (!Array.isArray(holders) || holders.length === 0) return [] as string[];
  const officeMaps = await buildOfficeIdMapsByHolderType(holders);
  const resolvedOfficeIds = holders.map((holder) => {
    const holderType = normalizeHolderType(holder.holderType);
    const holderId = String(holder.holderId || '').trim();
    if (!holderType || !isObjectId(holderId) || holderType === 'STORE') return null;
    if (holderType === 'OFFICE') return officeMaps.officeByOfficeId.get(holderId) || null;
    if (holderType === 'EMPLOYEE') return officeMaps.officeByEmployeeId.get(holderId) || null;
    if (holderType === 'SUB_LOCATION') return officeMaps.officeBySubLocationId.get(holderId) || null;
    if (holderType === 'USER') return officeMaps.officeByUserId.get(holderId) || null;
    return null;
  });

  return uniqueObjectIdStrings(resolvedOfficeIds);
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
