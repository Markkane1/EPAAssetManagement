import type { AssetItem } from "@/types";

export function getOfficeHolderId(item: AssetItem): string | null {
  if (item.holder_type === "OFFICE") {
    return item.holder_id || null;
  }
  return null;
}

export function isStoreHolder(item: AssetItem): boolean {
  return item.holder_type === "STORE";
}
