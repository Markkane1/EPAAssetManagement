import mongoose from 'mongoose';
import { AssetItemModel } from '../models/assetItem.model';
import { AssetModel } from '../models/asset.model';

type SessionOptions = {
  session?: mongoose.ClientSession;
};

type AssetSignatureSource = {
  _id?: unknown;
  id?: unknown;
  name?: unknown;
  category_id?: unknown;
  subcategory?: unknown;
  description?: unknown;
  specification?: unknown;
  vendor_id?: unknown;
  project_id?: unknown;
  scheme_id?: unknown;
  unit_price?: unknown;
  acquisition_date?: unknown;
  quantity?: unknown;
  dimensions?: { length?: unknown; width?: unknown; height?: unknown } | null;
  attachment_path?: unknown;
  created_at?: unknown;
};

type AssetCandidate = AssetSignatureSource & {
  _id: unknown;
  officeItemCount?: number;
};

function toIdString(value: unknown) {
  if (!value) return '';
  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }
  return String(value).trim();
}

function normalizeAssetText(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeOptionalAssetText(value: unknown) {
  const normalized = normalizeAssetText(value);
  return normalized || '';
}

function toTimestamp(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function getAssetMetadataScore(asset: AssetSignatureSource) {
  let score = 0;
  if (normalizeOptionalAssetText(asset.description)) score += 1;
  if (normalizeOptionalAssetText(asset.specification)) score += 2;
  if (toIdString(asset.vendor_id)) score += 1;
  if (toIdString(asset.project_id)) score += 1;
  if (toIdString(asset.scheme_id)) score += 1;
  if (typeof asset.unit_price === 'number' && Number.isFinite(asset.unit_price)) score += 1;
  if (asset.acquisition_date) score += 1;
  if (asset.attachment_path) score += 1;
  const numericQuantity =
    typeof asset.quantity === 'number'
      ? asset.quantity
      : Number(asset.quantity ?? 0);
  if (Number.isFinite(numericQuantity) && numericQuantity > 1) score += 1;
  if (
    asset.dimensions
    && (
      asset.dimensions.length != null
      || asset.dimensions.width != null
      || asset.dimensions.height != null
    )
  ) {
    score += 1;
  }
  return score;
}

function compareAssetCandidates(left: AssetCandidate, right: AssetCandidate) {
  const leftOfficeCount = Number(left.officeItemCount || 0);
  const rightOfficeCount = Number(right.officeItemCount || 0);
  if (leftOfficeCount !== rightOfficeCount) {
    return rightOfficeCount - leftOfficeCount;
  }

  const leftScore = getAssetMetadataScore(left);
  const rightScore = getAssetMetadataScore(right);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const leftCreatedAt = toTimestamp(left.created_at);
  const rightCreatedAt = toTimestamp(right.created_at);
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return toIdString(left._id).localeCompare(toIdString(right._id));
}

export function buildOfficeAssetSignature(asset: AssetSignatureSource) {
  return [
    normalizeAssetText(asset.name),
    toIdString(asset.category_id),
    normalizeOptionalAssetText(asset.subcategory),
  ].join('::');
}

async function readOfficeAssetIds(officeId: string, options: SessionOptions = {}) {
  const query = AssetItemModel.find({
    holder_type: 'OFFICE',
    holder_id: officeId,
    is_active: { $ne: false },
  }).distinct('asset_id');
  if (options.session) {
    query.session(options.session);
  }
  const ids = await query;
  return ids.map((value) => toIdString(value)).filter(Boolean);
}

async function readAssetsByIds(assetIds: string[], options: SessionOptions = {}) {
  if (assetIds.length === 0) return [];
  const query = AssetModel.find({
    _id: { $in: assetIds },
    is_active: { $ne: false },
  }).lean();
  if (options.session) {
    query.session(options.session);
  }
  return query;
}

async function readOfficeItemCountsByAssetIds(officeId: string, assetIds: string[], options: SessionOptions = {}) {
  if (assetIds.length === 0) return new Map<string, number>();
  const aggregate = AssetItemModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    {
      $match: {
        holder_type: 'OFFICE',
        holder_id: new mongoose.Types.ObjectId(officeId),
        is_active: { $ne: false },
        asset_id: { $in: assetIds.map((assetId) => new mongoose.Types.ObjectId(assetId)) },
      },
    },
    {
      $group: {
        _id: '$asset_id',
        count: { $sum: 1 },
      },
    },
  ]);
  if (options.session) {
    aggregate.session(options.session);
  }
  const rows = await aggregate.exec();
  return new Map(rows.map((row) => [toIdString(row._id), row.count]));
}

export async function resolveOfficeCanonicalAsset(
  officeId: string,
  source: AssetSignatureSource,
  options: SessionOptions = {}
) {
  const signature = buildOfficeAssetSignature(source);
  if (!signature || !normalizeAssetText(source.name)) {
    return null;
  }

  const officeAssetIds = await readOfficeAssetIds(officeId, options);
  if (officeAssetIds.length === 0) {
    return null;
  }

  const officeAssets = await readAssetsByIds(officeAssetIds, options);
  const matchingAssets = officeAssets.filter((asset) => buildOfficeAssetSignature(asset) === signature);
  if (matchingAssets.length === 0) {
    return null;
  }

  const officeCounts = await readOfficeItemCountsByAssetIds(
    officeId,
    matchingAssets.map((asset) => toIdString(asset._id)),
    options
  );

  const rankedAssets = matchingAssets
    .map((asset) => ({
      ...asset,
      officeItemCount: officeCounts.get(toIdString(asset._id)) || 0,
    }))
    .sort(compareAssetCandidates);

  return rankedAssets[0] || null;
}

export async function resolveOfficeCanonicalAssetId(
  officeId: string,
  source: AssetSignatureSource,
  options: SessionOptions = {}
) {
  const canonical = await resolveOfficeCanonicalAsset(officeId, source, options);
  return canonical ? toIdString(canonical._id) : null;
}

export async function syncAssetQuantityFloor(
  assetId: string,
  minimumQuantity: number,
  options: SessionOptions = {}
) {
  const normalizedAssetId = toIdString(assetId);
  if (!normalizedAssetId) return;

  const aggregate = AssetItemModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    {
      $match: {
        asset_id: new mongoose.Types.ObjectId(normalizedAssetId),
        is_active: { $ne: false },
      },
    },
    {
      $group: {
        _id: '$asset_id',
        count: { $sum: 1 },
      },
    },
  ]);
  if (options.session) {
    aggregate.session(options.session);
  }
  const countRow = await aggregate.exec();
  const activeItemCount = Number(countRow[0]?.count || 0);

  const query = AssetModel.findById(normalizedAssetId);
  if (options.session) {
    query.session(options.session);
  }
  const asset: any = await query;
  if (!asset) return;

  const currentQuantity = Number(asset.quantity || 0);
  const desiredQuantity = Math.max(currentQuantity, activeItemCount, Math.max(0, Math.floor(minimumQuantity || 0)));
  if (desiredQuantity !== currentQuantity) {
    asset.quantity = desiredQuantity;
    await asset.save(options.session ? { session: options.session } : undefined);
  }
}

export async function canonicalizeOfficeAssetItems(params: {
  officeId: string;
  assetItemIds: string[];
  session?: mongoose.ClientSession;
}) {
  const officeId = toIdString(params.officeId);
  const assetItemIds = Array.from(new Set(params.assetItemIds.map((value) => toIdString(value)).filter(Boolean)));
  if (!officeId || assetItemIds.length === 0) {
    return { updatedItemCount: 0, canonicalAssetIds: [] as string[] };
  }

  const itemQuery = AssetItemModel.find({
    _id: { $in: assetItemIds },
    holder_type: 'OFFICE',
    holder_id: officeId,
    is_active: { $ne: false },
  }).lean();
  if (params.session) {
    itemQuery.session(params.session);
  }
  const items = await itemQuery;
  if (items.length === 0) {
    return { updatedItemCount: 0, canonicalAssetIds: [] as string[] };
  }

  const assetIds = Array.from(new Set(items.map((item) => toIdString(item.asset_id)).filter(Boolean)));
  const assets = await readAssetsByIds(assetIds, { session: params.session });
  const assetById = new Map(assets.map((asset) => [toIdString(asset._id), asset]));

  const rewrites = new Map<string, { itemIds: string[]; canonicalAssetId: string }>();
  const canonicalAssetIds = new Set<string>();

  for (const item of items) {
    const currentAssetId = toIdString(item.asset_id);
    const asset = assetById.get(currentAssetId);
    if (!asset) continue;
    const canonicalAssetId = await resolveOfficeCanonicalAssetId(officeId, asset, { session: params.session });
    if (!canonicalAssetId || canonicalAssetId === currentAssetId) {
      canonicalAssetIds.add(currentAssetId);
      continue;
    }

    const rewriteKey = `${currentAssetId}=>${canonicalAssetId}`;
    const existing = rewrites.get(rewriteKey) || { itemIds: [], canonicalAssetId };
    existing.itemIds.push(toIdString(item._id));
    rewrites.set(rewriteKey, existing);
    canonicalAssetIds.add(canonicalAssetId);
  }

  let updatedItemCount = 0;
  for (const [rewriteKey, rewrite] of rewrites.entries()) {
    const [sourceAssetId] = rewriteKey.split('=>');
    const update = await AssetItemModel.updateMany(
      {
        _id: { $in: rewrite.itemIds },
        holder_type: 'OFFICE',
        holder_id: officeId,
        asset_id: sourceAssetId,
      },
      { asset_id: rewrite.canonicalAssetId },
      params.session ? { session: params.session } : undefined
    );
    updatedItemCount += Number(update.modifiedCount || 0);
  }

  return {
    updatedItemCount,
    canonicalAssetIds: Array.from(canonicalAssetIds),
  };
}
