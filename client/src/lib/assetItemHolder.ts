import type { AssetItem } from "@/types";

export function getOfficeHolderId(item: AssetItem): string | null {
  if (item.holder_type === "OFFICE") {
    return item.holder_id || null;
  }
  if (item.holder_type === "STORE") {
    return null;
  }
  // Back-compat for records not migrated to holder fields yet.
  return item.location_id || null;
}

export function isStoreHolder(item: AssetItem): boolean {
  return item.holder_type === "STORE";
}
