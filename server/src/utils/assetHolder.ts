import { Types } from 'mongoose';

export const ASSET_HOLDER_TYPES = ['OFFICE', 'STORE'] as const;
export type AssetHolderType = (typeof ASSET_HOLDER_TYPES)[number];

type IdLike = string | Types.ObjectId | null | undefined | unknown;
type AssetItemHolderShape = Record<string, unknown>;

function toIdString(value: IdLike): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  return String(value);
}

export function getAssetItemOfficeId(item: AssetItemHolderShape): string | null {
  const holderType = String(item?.holder_type || '');
  if (holderType === 'OFFICE') {
    return toIdString(item?.holder_id);
  }
  if (holderType === 'STORE') {
    return null;
  }
  return toIdString(item?.location_id);
}

export function getAssetItemHolder(item: AssetItemHolderShape): { holderType: AssetHolderType; holderId: string } | null {
  const holderType = String(item?.holder_type || '');
  if (holderType === 'OFFICE' || holderType === 'STORE') {
    const holderId = toIdString(item?.holder_id);
    if (!holderId) return null;
    return {
      holderType: holderType as AssetHolderType,
      holderId,
    };
  }

  const locationId = toIdString(item?.location_id);
  if (!locationId) return null;
  return {
    holderType: 'OFFICE',
    holderId: locationId,
  };
}

export function isAssetItemHeldByOffice(item: AssetItemHolderShape, officeId: string) {
  const officeHolderId = getAssetItemOfficeId(item);
  return Boolean(officeHolderId) && officeHolderId === officeId;
}

export function officeAssetItemFilter(officeId: string) {
  return {
    $or: [
      { holder_type: 'OFFICE', holder_id: officeId },
      { holder_type: { $exists: false }, location_id: officeId },
      { holder_type: null, location_id: officeId },
    ],
  };
}

export function setAssetItemOfficeHolderUpdate(officeId: string, includeLegacyLocation = false) {
  const update: Record<string, unknown> = {
    holder_type: 'OFFICE',
    holder_id: officeId,
  };
  if (includeLegacyLocation) {
    update.location_id = officeId;
  }
  return update;
}

export function setAssetItemStoreHolderUpdate(storeId: string) {
  return {
    holder_type: 'STORE',
    holder_id: storeId,
  };
}
