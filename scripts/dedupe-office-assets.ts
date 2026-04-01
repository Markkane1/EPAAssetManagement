import mongoose from 'mongoose';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { connectDatabase } = require('../server/src/config/db');
const { AssetItemModel } = require('../server/src/models/assetItem.model');
const { AssetModel } = require('../server/src/models/asset.model');
const {
  buildOfficeAssetSignature,
  syncAssetQuantityFloor,
} = require('../server/src/services/officeAssetCanonicalization.service');

type OfficeAssetItemRow = {
  _id: mongoose.Types.ObjectId;
  holder_id: mongoose.Types.ObjectId;
  asset_id: mongoose.Types.ObjectId;
};

type AssetRow = {
  _id: mongoose.Types.ObjectId;
  name?: string | null;
  category_id?: mongoose.Types.ObjectId | null;
  subcategory?: string | null;
  description?: string | null;
  specification?: string | null;
  vendor_id?: mongoose.Types.ObjectId | null;
  project_id?: mongoose.Types.ObjectId | null;
  scheme_id?: mongoose.Types.ObjectId | null;
  unit_price?: number | null;
  acquisition_date?: Date | null;
  quantity?: number | null;
  dimensions?: { length?: number | null; width?: number | null; height?: number | null } | null;
  attachment_path?: string | null;
  created_at?: Date | null;
  is_active?: boolean | null;
};

function toId(value: unknown) {
  if (!value) return '';
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  return String(value).trim();
}

function toTimestamp(value: unknown) {
  const parsed = value instanceof Date ? value : new Date(String(value || ''));
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function metadataScore(asset: AssetRow) {
  let score = 0;
  if (normalizeText(asset.description)) score += 1;
  if (normalizeText(asset.specification)) score += 2;
  if (toId(asset.vendor_id)) score += 1;
  if (toId(asset.project_id)) score += 1;
  if (toId(asset.scheme_id)) score += 1;
  if (typeof asset.unit_price === 'number' && Number.isFinite(asset.unit_price)) score += 1;
  if (asset.acquisition_date) score += 1;
  if (asset.attachment_path) score += 1;
  if ((asset.quantity || 0) > 1) score += 1;
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

function compareCandidates(
  left: { asset: AssetRow; officeItemCount: number },
  right: { asset: AssetRow; officeItemCount: number }
) {
  if (left.officeItemCount !== right.officeItemCount) {
    return right.officeItemCount - left.officeItemCount;
  }
  const scoreDelta = metadataScore(right.asset) - metadataScore(left.asset);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  const createdDelta = toTimestamp(left.asset.created_at) - toTimestamp(right.asset.created_at);
  if (createdDelta !== 0) {
    return createdDelta;
  }
  return toId(left.asset._id).localeCompare(toId(right.asset._id));
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.warn('WARNING: This script rewires office-held asset items onto one canonical asset per office/signature.');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN (writes enabled)'}`);

  try {
    await connectDatabase();

    const officeItems = (await AssetItemModel.find(
      {
        holder_type: 'OFFICE',
        is_active: { $ne: false },
      },
      {
        _id: 1,
        holder_id: 1,
        asset_id: 1,
      }
    ).lean()) as OfficeAssetItemRow[];

    const assetIds = Array.from(new Set(officeItems.map((item) => toId(item.asset_id)).filter(Boolean)));
    const assets = (await AssetModel.find(
      {
        _id: { $in: assetIds },
        is_active: { $ne: false },
      },
      {
        name: 1,
        category_id: 1,
        subcategory: 1,
        description: 1,
        specification: 1,
        vendor_id: 1,
        project_id: 1,
        scheme_id: 1,
        unit_price: 1,
        acquisition_date: 1,
        quantity: 1,
        dimensions: 1,
        attachment_path: 1,
        created_at: 1,
        is_active: 1,
      }
    ).lean()) as AssetRow[];

    const assetById = new Map(assets.map((asset) => [toId(asset._id), asset]));
    const grouped = new Map<
      string,
      {
        officeId: string;
        signature: string;
        assetIds: Set<string>;
        itemIdsByAssetId: Map<string, string[]>;
      }
    >();

    for (const item of officeItems) {
      const officeId = toId(item.holder_id);
      const assetId = toId(item.asset_id);
      const asset = assetById.get(assetId);
      if (!officeId || !assetId || !asset) continue;

      const signature = buildOfficeAssetSignature(asset);
      if (!signature) continue;
      const groupKey = `${officeId}::${signature}`;
      const group = grouped.get(groupKey) || {
        officeId,
        signature,
        assetIds: new Set<string>(),
        itemIdsByAssetId: new Map<string, string[]>(),
      };
      group.assetIds.add(assetId);
      const itemIds = group.itemIdsByAssetId.get(assetId) || [];
      itemIds.push(toId(item._id));
      group.itemIdsByAssetId.set(assetId, itemIds);
      grouped.set(groupKey, group);
    }

    const duplicateGroups = Array.from(grouped.values()).filter((group) => group.assetIds.size > 1);
    console.log(`Office-held asset items scanned: ${officeItems.length}`);
    console.log(`Duplicate office/signature groups found: ${duplicateGroups.length}`);

    let groupsUpdated = 0;
    let itemRewrites = 0;
    const quantityFloors = new Map<string, number>();
    const duplicateAssetIds = new Set<string>();

    for (const group of duplicateGroups) {
      const candidates = Array.from(group.assetIds)
        .map((assetId) => {
          const asset = assetById.get(assetId);
          if (!asset) return null;
          return {
            asset,
            officeItemCount: (group.itemIdsByAssetId.get(assetId) || []).length,
          };
        })
        .filter((entry): entry is { asset: AssetRow; officeItemCount: number } => Boolean(entry))
        .sort(compareCandidates);

      const canonical = candidates[0];
      if (!canonical) continue;

      const canonicalId = toId(canonical.asset._id);
      const canonicalQuantityFloor = candidates.reduce((sum, candidate) => {
        return sum + Math.max(0, Number(candidate.asset.quantity || 0));
      }, 0);
      quantityFloors.set(canonicalId, Math.max(quantityFloors.get(canonicalId) || 0, canonicalQuantityFloor));

      for (const candidate of candidates.slice(1)) {
        const duplicateId = toId(candidate.asset._id);
        const itemIds = group.itemIdsByAssetId.get(duplicateId) || [];
        if (itemIds.length === 0) continue;

        groupsUpdated += 1;
        itemRewrites += itemIds.length;
        duplicateAssetIds.add(duplicateId);

        console.log(
          `${dryRun ? '[dry-run]' : '[merge]'} office=${group.officeId} asset=${duplicateId} -> ${canonicalId} items=${itemIds.length}`
        );

        if (!dryRun) {
          await AssetItemModel.updateMany(
            {
              _id: { $in: itemIds },
              holder_type: 'OFFICE',
              holder_id: group.officeId,
              asset_id: duplicateId,
            },
            { asset_id: canonicalId }
          );
        }
      }
    }

    console.log(`Planned item rewrites: ${itemRewrites}`);
    console.log(`Touched canonical assets: ${quantityFloors.size}`);

    if (!dryRun) {
      for (const [assetId, minimumQuantity] of quantityFloors.entries()) {
        await syncAssetQuantityFloor(assetId, minimumQuantity);
      }

      let retiredAssets = 0;
      for (const duplicateAssetId of duplicateAssetIds) {
        const activeItemCount = await AssetItemModel.countDocuments({
          asset_id: duplicateAssetId,
          is_active: { $ne: false },
        });
        if (activeItemCount > 0) continue;
        const result = await AssetModel.updateOne(
          { _id: duplicateAssetId, is_active: { $ne: false } },
          { $set: { is_active: false } }
        );
        retiredAssets += Number(result.modifiedCount || 0);
      }
      console.log(`Retired orphaned duplicate assets: ${retiredAssets}`);
    } else {
      console.log('Dry-run complete. No database writes were applied.');
    }

    console.log(`Groups processed: ${groupsUpdated}`);
  } catch (error) {
    console.error('Office asset dedupe failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
