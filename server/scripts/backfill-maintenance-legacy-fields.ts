import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { MaintenanceRecordModel } from '../src/models/maintenanceRecord.model';
import { AssetItemModel } from '../src/models/assetItem.model';
import { VendorModel } from '../src/models/vendor.model';
import { RecordModel } from '../src/models/record.model';
import { DocumentLinkModel } from '../src/models/documentLink.model';
import { DocumentModel } from '../src/models/document.model';
import { DocumentVersionModel } from '../src/models/documentVersion.model';

type MaintenanceDoc = {
  _id: mongoose.Types.ObjectId;
  asset_item_id?: mongoose.Types.ObjectId | null;
  performed_by?: string | null;
  performed_by_vendor_id?: mongoose.Types.ObjectId | null;
  estimate_document_id?: mongoose.Types.ObjectId | null;
  is_active?: boolean | null;
};

type AssetItemDoc = {
  _id: mongoose.Types.ObjectId;
  holder_type?: string | null;
  holder_id?: mongoose.Types.ObjectId | null;
};

type VendorDoc = {
  _id: mongoose.Types.ObjectId;
  name?: string | null;
  office_id?: mongoose.Types.ObjectId | null;
};

type RecordDoc = {
  _id: mongoose.Types.ObjectId;
  record_type?: string | null;
  maintenance_record_id?: mongoose.Types.ObjectId | null;
};

type DocumentLinkDoc = {
  _id: mongoose.Types.ObjectId;
  document_id?: mongoose.Types.ObjectId | null;
  entity_type?: string | null;
  entity_id?: mongoose.Types.ObjectId | null;
};

type DocumentDoc = {
  _id: mongoose.Types.ObjectId;
  doc_type?: string | null;
  office_id?: mongoose.Types.ObjectId | null;
  created_at?: Date | null;
};

function toId(value: unknown) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  return String(value);
}

function normalizeName(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function printSummary(label: string, value: number) {
  console.log(`${label}: ${value}`);
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.warn('WARNING: Back up your database before running this migration.');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN (writes enabled)'}`);

  try {
    await connectDatabase();

    const maintenanceDocs = (await MaintenanceRecordModel.collection
      .find(
        { is_active: { $ne: false } },
        {
          projection: {
            _id: 1,
            asset_item_id: 1,
            performed_by: 1,
            performed_by_vendor_id: 1,
            estimate_document_id: 1,
            is_active: 1,
          },
        }
      )
      .toArray()) as MaintenanceDoc[];

    const maintenanceIdSet = new Set(maintenanceDocs.map((doc) => doc._id.toString()));
    const assetItemIds = Array.from(
      new Set(maintenanceDocs.map((doc) => toId(doc.asset_item_id)).filter((value): value is string => Boolean(value)))
    ).map((id) => new mongoose.Types.ObjectId(id));

    const assetItems = (await AssetItemModel.collection
      .find(
        { _id: { $in: assetItemIds } },
        {
          projection: {
            _id: 1,
            holder_type: 1,
            holder_id: 1,
          },
        }
      )
      .toArray()) as AssetItemDoc[];
    const officeByAssetItemId = new Map<string, string>();
    assetItems.forEach((item) => {
      if (String(item.holder_type || '').toUpperCase() !== 'OFFICE') return;
      const officeId = toId(item.holder_id);
      if (!officeId) return;
      officeByAssetItemId.set(item._id.toString(), officeId);
    });

    const vendors = (await VendorModel.collection
      .find(
        { office_id: { $ne: null } },
        { projection: { _id: 1, office_id: 1, name: 1 } }
      )
      .toArray()) as VendorDoc[];
    const vendorByOfficeAndName = new Map<string, string[]>();
    vendors.forEach((vendor) => {
      const officeId = toId(vendor.office_id);
      const name = normalizeName(vendor.name);
      if (!officeId || !name) return;
      const key = `${officeId}::${name}`;
      const list = vendorByOfficeAndName.get(key) || [];
      list.push(vendor._id.toString());
      vendorByOfficeAndName.set(key, list);
    });

    const recordDocs = (await RecordModel.collection
      .find(
        {
          record_type: 'MAINTENANCE',
          maintenance_record_id: { $in: Array.from(maintenanceIdSet).map((id) => new mongoose.Types.ObjectId(id)) },
        },
        {
          projection: {
            _id: 1,
            record_type: 1,
            maintenance_record_id: 1,
          },
        }
      )
      .toArray()) as RecordDoc[];

    const recordIdByMaintenanceId = new Map<string, string>();
    recordDocs.forEach((recordDoc) => {
      const maintenanceId = toId(recordDoc.maintenance_record_id);
      if (!maintenanceId) return;
      recordIdByMaintenanceId.set(maintenanceId, recordDoc._id.toString());
    });

    const recordIds = Array.from(new Set(Array.from(recordIdByMaintenanceId.values())));
    const linkFilters: Record<string, unknown>[] = [
      {
        entity_type: 'MaintenanceRecord',
        entity_id: { $in: Array.from(maintenanceIdSet).map((id) => new mongoose.Types.ObjectId(id)) },
      },
    ];
    if (recordIds.length > 0) {
      linkFilters.push({
        entity_type: 'Record',
        entity_id: { $in: recordIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
    }
    const links = (await DocumentLinkModel.collection
      .find({ $or: linkFilters }, { projection: { _id: 1, document_id: 1, entity_type: 1, entity_id: 1 } })
      .toArray()) as DocumentLinkDoc[];

    const docIds = Array.from(
      new Set(links.map((link) => toId(link.document_id)).filter((value): value is string => Boolean(value)))
    );

    const documents = docIds.length
      ? ((await DocumentModel.collection
          .find(
            { _id: { $in: docIds.map((id) => new mongoose.Types.ObjectId(id)) }, doc_type: 'MaintenanceEstimate' },
            { projection: { _id: 1, doc_type: 1, office_id: 1, created_at: 1 } }
          )
          .toArray()) as DocumentDoc[])
      : [];
    const documentById = new Map<string, DocumentDoc>();
    documents.forEach((document) => {
      documentById.set(document._id.toString(), document);
    });

    const pdfDocIds = docIds.length
      ? await DocumentVersionModel.collection.distinct('document_id', {
          document_id: { $in: docIds.map((id) => new mongoose.Types.ObjectId(id)) },
          mime_type: 'application/pdf',
        })
      : [];
    const pdfDocIdSet = new Set(pdfDocIds.map((id: unknown) => toId(id)).filter((value): value is string => Boolean(value)));

    const maintenanceIdByRecordId = new Map<string, string>();
    recordIdByMaintenanceId.forEach((recordId, maintenanceId) => {
      maintenanceIdByRecordId.set(recordId, maintenanceId);
    });

    const estimateCandidatesByMaintenanceId = new Map<string, DocumentDoc[]>();
    links.forEach((link) => {
      const docId = toId(link.document_id);
      if (!docId) return;
      const document = documentById.get(docId);
      if (!document) return;
      if (!pdfDocIdSet.has(docId)) return;

      const entityType = String(link.entity_type || '');
      const entityId = toId(link.entity_id);
      if (!entityId) return;

      let maintenanceId: string | null = null;
      if (entityType === 'MaintenanceRecord') {
        maintenanceId = entityId;
      } else if (entityType === 'Record') {
        maintenanceId = maintenanceIdByRecordId.get(entityId) || null;
      }
      if (!maintenanceId) return;

      const list = estimateCandidatesByMaintenanceId.get(maintenanceId) || [];
      list.push(document);
      estimateCandidatesByMaintenanceId.set(maintenanceId, list);
    });

    let vendorBackfilled = 0;
    let vendorAmbiguous = 0;
    let vendorMissingOffice = 0;
    let estimateBackfilled = 0;
    let estimateNoCandidate = 0;
    let estimateWrongOffice = 0;
    let updatesPlanned = 0;

    const operations: Array<Record<string, unknown>> = [];

    for (const maintenance of maintenanceDocs) {
      const maintenanceId = maintenance._id.toString();
      const setPayload: Record<string, unknown> = {};
      const assetItemId = toId(maintenance.asset_item_id);
      const officeId = assetItemId ? officeByAssetItemId.get(assetItemId) || null : null;

      if (!maintenance.performed_by_vendor_id) {
        const performedBy = normalizeName(maintenance.performed_by);
        if (officeId && performedBy) {
          const vendorMatches = vendorByOfficeAndName.get(`${officeId}::${performedBy}`) || [];
          if (vendorMatches.length === 1) {
            setPayload.performed_by_vendor_id = new mongoose.Types.ObjectId(vendorMatches[0]);
            vendorBackfilled += 1;
          } else if (vendorMatches.length > 1) {
            vendorAmbiguous += 1;
          }
        } else if (!officeId) {
          vendorMissingOffice += 1;
        }
      }

      if (!maintenance.estimate_document_id) {
        const candidates = estimateCandidatesByMaintenanceId.get(maintenanceId) || [];
        if (candidates.length === 0) {
          estimateNoCandidate += 1;
        } else {
          const officeScoped = candidates.filter((doc) => {
            if (!officeId) return true;
            const docOfficeId = toId(doc.office_id);
            return Boolean(docOfficeId && docOfficeId === officeId);
          });
          if (officeScoped.length === 0) {
            estimateWrongOffice += 1;
          } else {
            const selected = officeScoped.sort((left, right) => {
              const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
              const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
              return rightTime - leftTime;
            })[0];
            setPayload.estimate_document_id = selected._id;
            estimateBackfilled += 1;
          }
        }
      }

      if (Object.keys(setPayload).length > 0) {
        updatesPlanned += 1;
        operations.push({
          updateOne: {
            filter: { _id: maintenance._id },
            update: { $set: setPayload },
          },
        });
      }
    }

    console.log('\nBackfill summary');
    printSummary('Maintenance records scanned', maintenanceDocs.length);
    printSummary('Records with planned updates', updatesPlanned);
    printSummary('performed_by_vendor_id backfilled', vendorBackfilled);
    printSummary('performed_by vendor ambiguous matches', vendorAmbiguous);
    printSummary('performed_by vendor missing office context', vendorMissingOffice);
    printSummary('estimate_document_id backfilled', estimateBackfilled);
    printSummary('estimate_document_id no candidate found', estimateNoCandidate);
    printSummary('estimate candidates rejected by office scope', estimateWrongOffice);

    if (!dryRun && operations.length > 0) {
      await MaintenanceRecordModel.bulkWrite(operations, { ordered: false });
      console.log('\nBulk update applied.');
    } else if (dryRun) {
      console.log('\nDry-run: no updates applied.');
    } else {
      console.log('\nNo updates needed.');
    }
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
