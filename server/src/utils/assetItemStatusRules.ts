const PRIMARY_ITEM_STATUSES = ['Available', 'Assigned', 'Maintenance', 'Retired'] as const;
const SYSTEM_ITEM_STATUSES = ['Transferred', 'InTransit'] as const;
const LEGACY_ITEM_STATUSES = ['Damaged'] as const;
const FUNCTIONAL_STATUSES = ['Functional', 'Needs Repair', 'Non-Repairable'] as const;
const ASSIGNMENT_BLOCKED_FUNCTIONAL_STATUSES = new Set<AssetItemFunctionalStatus>([
  'Needs Repair',
  'Non-Repairable',
]);

const LEGACY_FUNCTIONAL_STATUS_MAP: Record<string, AssetItemFunctionalStatus> = {
  'Need Repairs': 'Needs Repair',
  Dead: 'Non-Repairable',
};

export type AssetItemPrimaryStatus = (typeof PRIMARY_ITEM_STATUSES)[number];
export type AssetItemSystemStatus = (typeof SYSTEM_ITEM_STATUSES)[number];
export type AssetItemLegacyStatus = (typeof LEGACY_ITEM_STATUSES)[number];
export type AssetItemFunctionalStatus = (typeof FUNCTIONAL_STATUSES)[number];

export const ASSET_ITEM_PRIMARY_STATUSES = [...PRIMARY_ITEM_STATUSES];
export const ASSET_ITEM_SYSTEM_STATUSES = [...SYSTEM_ITEM_STATUSES];
export const ASSET_ITEM_LEGACY_STATUSES = [...LEGACY_ITEM_STATUSES];
export const ASSET_ITEM_FUNCTIONAL_STATUSES = [...FUNCTIONAL_STATUSES];

export function normalizeFunctionalStatus(value: unknown): AssetItemFunctionalStatus | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return LEGACY_FUNCTIONAL_STATUS_MAP[normalized] || (normalized as AssetItemFunctionalStatus);
}

export function getAssetItemAssignmentBlockReason(item: {
  assignment_status?: unknown;
  item_status?: unknown;
  functional_status?: unknown;
  is_active?: unknown;
}) {
  if (item.is_active === false) {
    return 'Inactive asset items cannot be assigned';
  }

  const assignmentStatus = String(item.assignment_status || '').trim();
  if (assignmentStatus && assignmentStatus !== 'Unassigned') {
    return 'Only unassigned asset items can be assigned';
  }

  const itemStatus = String(item.item_status || '').trim();
  if (itemStatus && itemStatus !== 'Available') {
    return 'Only available asset items can be assigned';
  }

  const functionalStatus = normalizeFunctionalStatus(item.functional_status);
  if (functionalStatus && ASSIGNMENT_BLOCKED_FUNCTIONAL_STATUSES.has(functionalStatus)) {
    return `Asset items marked ${functionalStatus} cannot be assigned`;
  }

  return null;
}

export function isAssetItemAssignable(item: {
  assignment_status?: unknown;
  item_status?: unknown;
  functional_status?: unknown;
  is_active?: unknown;
}) {
  return getAssetItemAssignmentBlockReason(item) === null;
}

export function isSystemManagedAssetItemStatus(value: unknown) {
  const normalized = String(value || '').trim();
  return ASSET_ITEM_SYSTEM_STATUSES.includes(normalized as AssetItemSystemStatus);
}

export function isLegacyAssetItemStatus(value: unknown) {
  const normalized = String(value || '').trim();
  return ASSET_ITEM_LEGACY_STATUSES.includes(normalized as AssetItemLegacyStatus);
}

export function isPrimaryAssetItemStatus(value: unknown) {
  const normalized = String(value || '').trim();
  return ASSET_ITEM_PRIMARY_STATUSES.includes(normalized as AssetItemPrimaryStatus);
}

export function getAllowedPrimaryStatusesForFunctionalStatus(
  functionalStatus: AssetItemFunctionalStatus
): AssetItemPrimaryStatus[] {
  switch (functionalStatus) {
    case 'Functional':
      return ['Available', 'Assigned'];
    case 'Needs Repair':
      return ['Maintenance'];
    case 'Non-Repairable':
      return ['Retired'];
    default:
      return ['Available', 'Assigned'];
  }
}

export function getDefaultPrimaryStatusForFunctionalStatus(
  functionalStatus: AssetItemFunctionalStatus
): AssetItemPrimaryStatus {
  return getAllowedPrimaryStatusesForFunctionalStatus(functionalStatus)[0];
}

export function validateFunctionalStatusCombination(params: {
  itemStatus: unknown;
  functionalStatus: unknown;
}) {
  const functionalStatus = normalizeFunctionalStatus(params.functionalStatus);
  const itemStatus = String(params.itemStatus || '').trim();

  if (!functionalStatus || !itemStatus) return null;
  if (isSystemManagedAssetItemStatus(itemStatus) || isLegacyAssetItemStatus(itemStatus)) return null;
  if (!isPrimaryAssetItemStatus(itemStatus)) {
    return `Invalid asset state "${itemStatus}"`;
  }

  const allowedStatuses = getAllowedPrimaryStatusesForFunctionalStatus(functionalStatus);
  if (allowedStatuses.includes(itemStatus as AssetItemPrimaryStatus)) return null;

  return `Functional status "${functionalStatus}" only allows asset state: ${allowedStatuses.join(', ')}`;
}
