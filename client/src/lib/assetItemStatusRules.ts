import { AssetStatus, FunctionalStatus } from "@/types";

const PRIMARY_ITEM_STATUSES = [
  AssetStatus.Available,
  AssetStatus.Assigned,
  AssetStatus.Maintenance,
  AssetStatus.Retired,
] as const;

const SYSTEM_ITEM_STATUSES = [AssetStatus.Transferred, AssetStatus.InTransit] as const;
const LEGACY_ITEM_STATUSES = [AssetStatus.Damaged] as const;

export const assetItemConditionOptions = ["New", "Good", "Fair", "Poor", "Damaged"] as const;
export const assetItemFunctionalStatusOptions = [
  FunctionalStatus.Functional,
  FunctionalStatus.NeedsRepair,
  FunctionalStatus.NonRepairable,
] as const;
export const assetItemPrimaryStatusOptions = [...PRIMARY_ITEM_STATUSES];

export function normalizeFunctionalStatus(value: string | null | undefined) {
  if (!value) return FunctionalStatus.Functional;
  if (value === "Need Repairs") return FunctionalStatus.NeedsRepair;
  if (value === "Dead") return FunctionalStatus.NonRepairable;
  return value as FunctionalStatus;
}

export function isSystemManagedAssetState(value: string | null | undefined) {
  return SYSTEM_ITEM_STATUSES.includes(value as (typeof SYSTEM_ITEM_STATUSES)[number]);
}

export function isLegacyAssetState(value: string | null | undefined) {
  return LEGACY_ITEM_STATUSES.includes(value as (typeof LEGACY_ITEM_STATUSES)[number]);
}

export function getAllowedAssetStates(functionalStatus: string | null | undefined) {
  const normalized = normalizeFunctionalStatus(functionalStatus);

  switch (normalized) {
    case FunctionalStatus.Functional:
      return [AssetStatus.Available, AssetStatus.Assigned];
    case FunctionalStatus.NeedsRepair:
      return [AssetStatus.Maintenance];
    case FunctionalStatus.NonRepairable:
      return [AssetStatus.Retired];
    default:
      return [AssetStatus.Available, AssetStatus.Assigned];
  }
}

export function getDefaultAssetState(functionalStatus: string | null | undefined) {
  return getAllowedAssetStates(functionalStatus)[0];
}

export function getFunctionalStatusHelperText(functionalStatus: string | null | undefined) {
  const normalized = normalizeFunctionalStatus(functionalStatus);

  switch (normalized) {
    case FunctionalStatus.Functional:
      return "Functional items can stay available in stock or be assigned.";
    case FunctionalStatus.NeedsRepair:
      return "Needs Repair items are kept in maintenance until they become functional again.";
    case FunctionalStatus.NonRepairable:
      return "Non-Repairable items should be retired and kept out of circulation.";
    default:
      return "Functional status controls which asset state is valid.";
  }
}

export function isAssetItemAssignable(item: {
  assignment_status?: string | null;
  item_status?: string | null;
  functional_status?: string | null;
  is_active?: boolean | null;
}) {
  if (item.is_active === false) return false;
  if ((item.assignment_status || "") !== "Unassigned") return false;
  if ((item.item_status || "") !== AssetStatus.Available) return false;
  return normalizeFunctionalStatus(item.functional_status) === FunctionalStatus.Functional;
}
