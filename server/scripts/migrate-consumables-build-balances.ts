import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db';
import { UserModel } from '../src/models/user.model';
import { ConsumableBalanceModel } from '../src/modules/consumables/models/consumableBalance.model';
import { ConsumableBalanceTxnModel } from '../src/modules/consumables/models/consumableBalanceTxn.model';
import { ConsumableConsumptionModel } from '../src/modules/consumables/models/consumableConsumption.model';
import { ConsumableIssueModel } from '../src/modules/consumables/models/consumableIssue.model';
import { ConsumableLotModel } from '../src/modules/consumables/models/consumableLot.model';
import { ConsumableReturnModel } from '../src/modules/consumables/models/consumableReturn.model';

type HolderType = 'OFFICE' | 'USER';
type BalanceEventType = 'ISSUE_IN' | 'CONSUME_OUT' | 'RETURN_OUT' | 'RETURN_IN';

type ReplayOp = {
  source_kind: string;
  source_id: string;
  event_type: BalanceEventType;
  holder_type: HolderType;
  holder_id: string;
  consumable_id: string;
  quantity: number;
  performed_at: Date;
  performed_by_user_id: string | null;
  issue_id?: string | null;
  consumption_id?: string | null;
  lot_id?: string | null;
  marker: string;
};

type ReplayRecord = {
  source_kind: string;
  source_id: string;
  performed_at: Date;
  ops: ReplayOp[];
};

type BalanceState = {
  qty_in_total: number;
  qty_out_total: number;
  qty_on_hand: number;
};

type Anomaly = {
  source_kind: string;
  source_id: string;
  reason: string;
};

const QTY_FACTOR = 100;
const QTY_EPSILON = 1e-8;
const IN_EVENTS = new Set<BalanceEventType>(['ISSUE_IN', 'RETURN_IN']);
const OUT_EVENTS = new Set<BalanceEventType>(['CONSUME_OUT', 'RETURN_OUT']);

function roundQty(q: number) {
  return Math.round(q * QTY_FACTOR) / QTY_FACTOR;
}

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * QTY_FACTOR - Math.round(value * QTY_FACTOR)) < QTY_EPSILON;
}

function validateQtyInput(value: unknown) {
  const qty = Number(value);
  if (!Number.isFinite(qty)) {
    throw new Error('Quantity must be a valid number');
  }
  if (qty <= 0) {
    throw new Error('Quantity must be greater than 0');
  }
  if (!hasAtMostTwoDecimals(qty)) {
    throw new Error('Quantity must have at most 2 decimal places');
  }
  return qty;
}

function asIdString(value: unknown) {
  const id = String(value ?? '').trim();
  return id || null;
}

function asDate(value: unknown, fallback?: unknown) {
  const first = value === undefined || value === null || value === '' ? null : new Date(String(value));
  if (first && !Number.isNaN(first.getTime())) return first;

  const second = fallback === undefined || fallback === null || fallback === '' ? null : new Date(String(fallback));
  if (second && !Number.isNaN(second.getTime())) return second;

  return new Date(0);
}

function balanceKey(holderType: HolderType, holderId: string, consumableId: string) {
  return `${holderType}:${holderId}:${consumableId}`;
}

function markerOf(sourceKind: string, sourceId: string, leg?: string) {
  return leg
    ? `[migration-consumables-build-balances:${sourceKind}:${sourceId}:${leg}]`
    : `[migration-consumables-build-balances:${sourceKind}:${sourceId}]`;
}

function printTopAnomalies(anomalies: Anomaly[], max = 100) {
  if (anomalies.length === 0) {
    console.log('\nAnomalies: none');
    return;
  }

  console.log(`\nAnomalies (${anomalies.length})`);
  for (const anomaly of anomalies.slice(0, max)) {
    console.log(`  - ${anomaly.source_kind}:${anomaly.source_id} -> ${anomaly.reason}`);
  }
  if (anomalies.length > max) {
    console.log(`  ... and ${anomalies.length - max} more`);
  }
}

async function resolveConsumableByLot() {
  const rows = (await ConsumableLotModel.collection
    .find({}, { projection: { _id: 1, consumable_id: 1, consumable_item_id: 1 } })
    .toArray()) as Array<{
    _id: mongoose.Types.ObjectId;
    consumable_id?: mongoose.Types.ObjectId | null;
    consumable_item_id?: mongoose.Types.ObjectId | null;
  }>;

  const map = new Map<string, string>();
  for (const row of rows) {
    const consumableId = asIdString(row.consumable_id) || asIdString(row.consumable_item_id);
    if (consumableId) {
      map.set(String(row._id), consumableId);
    }
  }
  return map;
}

async function buildModuleIssueRecords(anomalies: Anomaly[]): Promise<ReplayRecord[]> {
  const issues = (await ConsumableIssueModel.collection
    .find(
      {},
      {
        projection: {
          _id: 1,
          lot_id: 1,
          to_type: 1,
          to_id: 1,
          quantity: 1,
          issued_by_user_id: 1,
          issued_at: 1,
          created_at: 1,
        },
      }
    )
    .toArray()) as Array<Record<string, unknown>>;

  const consumableByLot = await resolveConsumableByLot();
  const records: ReplayRecord[] = [];

  for (const row of issues) {
    const sourceId = String(row._id);
    const lotId = asIdString(row.lot_id);
    const toType = String(row.to_type ?? '').trim().toUpperCase();
    const toId = asIdString(row.to_id);
    const performedAt = asDate(row.issued_at, row.created_at);
    const performedBy = asIdString(row.issued_by_user_id);

    if (!lotId || !toId || (toType !== 'OFFICE' && toType !== 'USER')) {
      anomalies.push({
        source_kind: 'module_issue',
        source_id: sourceId,
        reason: 'Missing lot/to target fields',
      });
      continue;
    }

    const consumableId = consumableByLot.get(lotId);
    if (!consumableId) {
      anomalies.push({
        source_kind: 'module_issue',
        source_id: sourceId,
        reason: 'Unable to resolve consumable from lot',
      });
      continue;
    }

    records.push({
      source_kind: 'module_issue',
      source_id: sourceId,
      performed_at: performedAt,
      ops: [
        {
          source_kind: 'module_issue',
          source_id: sourceId,
          event_type: 'ISSUE_IN',
          holder_type: toType as HolderType,
          holder_id: toId,
          consumable_id: consumableId,
          quantity: Number(row.quantity),
          performed_at: performedAt,
          performed_by_user_id: performedBy,
          issue_id: sourceId,
          lot_id: lotId,
          marker: markerOf('module_issue', sourceId),
        },
      ],
    });
  }

  return records;
}

async function buildModuleConsumptionRecords(anomalies: Anomaly[]): Promise<ReplayRecord[]> {
  const rows = (await ConsumableConsumptionModel.collection
    .find(
      {},
      {
        projection: {
          _id: 1,
          source_type: 1,
          source_id: 1,
          consumable_id: 1,
          quantity: 1,
          consumed_at: 1,
          recorded_by_user_id: 1,
          issue_id: 1,
          lot_id: 1,
          created_at: 1,
        },
      }
    )
    .toArray()) as Array<Record<string, unknown>>;

  const records: ReplayRecord[] = [];

  for (const row of rows) {
    const sourceId = String(row._id);
    const sourceType = String(row.source_type ?? '').trim().toUpperCase();
    const sourceHolderId = asIdString(row.source_id);
    const consumableId = asIdString(row.consumable_id);
    const performedAt = asDate(row.consumed_at, row.created_at);
    const performedBy = asIdString(row.recorded_by_user_id);

    if ((sourceType !== 'OFFICE' && sourceType !== 'USER') || !sourceHolderId || !consumableId) {
      anomalies.push({
        source_kind: 'module_consumption',
        source_id: sourceId,
        reason: 'Missing source/consumable fields',
      });
      continue;
    }

    records.push({
      source_kind: 'module_consumption',
      source_id: sourceId,
      performed_at: performedAt,
      ops: [
        {
          source_kind: 'module_consumption',
          source_id: sourceId,
          event_type: 'CONSUME_OUT',
          holder_type: sourceType as HolderType,
          holder_id: sourceHolderId,
          consumable_id: consumableId,
          quantity: Number(row.quantity),
          performed_at: performedAt,
          performed_by_user_id: performedBy,
          consumption_id: sourceId,
          issue_id: asIdString(row.issue_id),
          lot_id: asIdString(row.lot_id),
          marker: markerOf('module_consumption', sourceId),
        },
      ],
    });
  }

  return records;
}

async function buildModuleReturnRecords(anomalies: Anomaly[]): Promise<ReplayRecord[]> {
  const rows = (await ConsumableReturnModel.collection
    .find(
      {},
      {
        projection: {
          _id: 1,
          mode: 1,
          consumable_id: 1,
          quantity: 1,
          from_user_id: 1,
          to_office_id: 1,
          from_office_id: 1,
          to_lot_id: 1,
          performed_by_user_id: 1,
          performed_at: 1,
          created_at: 1,
        },
      }
    )
    .toArray()) as Array<Record<string, unknown>>;

  const records: ReplayRecord[] = [];
  for (const row of rows) {
    const sourceId = String(row._id);
    const mode = String(row.mode ?? '').trim().toUpperCase();
    const consumableId = asIdString(row.consumable_id);
    const performedAt = asDate(row.performed_at, row.created_at);
    const performedBy = asIdString(row.performed_by_user_id);
    const qty = Number(row.quantity);

    if (!consumableId) {
      anomalies.push({
        source_kind: 'module_return',
        source_id: sourceId,
        reason: 'Missing consumable_id',
      });
      continue;
    }

    if (mode === 'USER_TO_OFFICE') {
      const fromUserId = asIdString(row.from_user_id);
      const toOfficeId = asIdString(row.to_office_id);
      if (!fromUserId || !toOfficeId) {
        anomalies.push({
          source_kind: 'module_return',
          source_id: sourceId,
          reason: 'Missing from_user_id or to_office_id for USER_TO_OFFICE',
        });
        continue;
      }
      records.push({
        source_kind: 'module_return',
        source_id: sourceId,
        performed_at: performedAt,
        ops: [
          {
            source_kind: 'module_return',
            source_id: sourceId,
            event_type: 'RETURN_OUT',
            holder_type: 'USER',
            holder_id: fromUserId,
            consumable_id: consumableId,
            quantity: qty,
            performed_at: performedAt,
            performed_by_user_id: performedBy,
            marker: markerOf('module_return', sourceId, 'out'),
          },
          {
            source_kind: 'module_return',
            source_id: sourceId,
            event_type: 'RETURN_IN',
            holder_type: 'OFFICE',
            holder_id: toOfficeId,
            consumable_id: consumableId,
            quantity: qty,
            performed_at: performedAt,
            performed_by_user_id: performedBy,
            marker: markerOf('module_return', sourceId, 'in'),
          },
        ],
      });
      continue;
    }

    if (mode === 'OFFICE_TO_STORE_LOT') {
      const fromOfficeId = asIdString(row.from_office_id);
      if (!fromOfficeId) {
        anomalies.push({
          source_kind: 'module_return',
          source_id: sourceId,
          reason: 'Missing from_office_id for OFFICE_TO_STORE_LOT',
        });
        continue;
      }
      records.push({
        source_kind: 'module_return',
        source_id: sourceId,
        performed_at: performedAt,
        ops: [
          {
            source_kind: 'module_return',
            source_id: sourceId,
            event_type: 'RETURN_OUT',
            holder_type: 'OFFICE',
            holder_id: fromOfficeId,
            consumable_id: consumableId,
            quantity: qty,
            performed_at: performedAt,
            performed_by_user_id: performedBy,
            lot_id: asIdString(row.to_lot_id),
            marker: markerOf('module_return', sourceId, 'out'),
          },
        ],
      });
      continue;
    }

    anomalies.push({
      source_kind: 'module_return',
      source_id: sourceId,
      reason: `Unknown mode '${mode}'`,
    });
  }

  return records;
}

function replay(
  records: ReplayRecord[],
  anomalies: Anomaly[]
): { balances: Map<string, BalanceState>; accepted_ops: ReplayOp[]; skipped_records: number } {
  const balances = new Map<string, BalanceState>();
  const acceptedOps: ReplayOp[] = [];
  let skippedRecords = 0;

  for (const record of records) {
    const startIndex = acceptedOps.length;
    const touched = new Map<string, BalanceState | null>();
    let failedReason: string | null = null;

    for (const op of record.ops) {
      try {
        const qty = roundQty(validateQtyInput(op.quantity));
        const key = balanceKey(op.holder_type, op.holder_id, op.consumable_id);
        if (!touched.has(key)) {
          const existing = balances.get(key);
          touched.set(
            key,
            existing
              ? {
                  qty_in_total: existing.qty_in_total,
                  qty_out_total: existing.qty_out_total,
                  qty_on_hand: existing.qty_on_hand,
                }
              : null
          );
        }

        const current = balances.get(key) || {
          qty_in_total: 0,
          qty_out_total: 0,
          qty_on_hand: 0,
        };

        if (IN_EVENTS.has(op.event_type)) {
          current.qty_in_total = roundQty(current.qty_in_total + qty);
          current.qty_on_hand = roundQty(current.qty_on_hand + qty);
        } else if (OUT_EVENTS.has(op.event_type)) {
          if (current.qty_on_hand + QTY_EPSILON < qty) {
            throw new Error(
              `Replay would go negative (on_hand=${current.qty_on_hand}, qty=${qty}, event=${op.event_type})`
            );
          }
          current.qty_out_total = roundQty(current.qty_out_total + qty);
          current.qty_on_hand = roundQty(current.qty_on_hand - qty);
        } else {
          throw new Error(`Unsupported event type '${op.event_type}'`);
        }

        balances.set(key, current);
        acceptedOps.push({
          ...op,
          quantity: qty,
        });
      } catch (error) {
        failedReason = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    if (failedReason) {
      skippedRecords += 1;
      anomalies.push({
        source_kind: record.source_kind,
        source_id: record.source_id,
        reason: failedReason,
      });
      acceptedOps.splice(startIndex);
      for (const [key, snapshot] of touched.entries()) {
        if (snapshot) {
          balances.set(key, snapshot);
        } else {
          balances.delete(key);
        }
      }
    }
  }

  return {
    balances,
    accepted_ops: acceptedOps,
    skipped_records: skippedRecords,
  };
}

async function resolveFallbackTxnUserId() {
  const preferredRoles = ['org_admin', 'office_head', 'caretaker'];
  for (const role of preferredRoles) {
    const row = (await UserModel.collection.findOne(
      { role },
      { projection: { _id: 1 } }
    )) as { _id?: mongoose.Types.ObjectId } | null;
    if (row?._id) return String(row._id);
  }
  const any = (await UserModel.collection.findOne({}, { projection: { _id: 1 } })) as {
    _id?: mongoose.Types.ObjectId;
  } | null;
  return any?._id ? String(any._id) : null;
}

async function upsertBalances(balanceMap: Map<string, BalanceState>) {
  const balanceIdByKey = new Map<string, string>();

  for (const [key, state] of balanceMap.entries()) {
    const [holderType, holderId, consumableId] = key.split(':');
    const doc = await ConsumableBalanceModel.findOneAndUpdate(
      {
        holder_type: holderType,
        holder_id: holderId,
        consumable_id: consumableId,
      },
      {
        $set: {
          qty_in_total: roundQty(state.qty_in_total),
          qty_out_total: roundQty(state.qty_out_total),
          qty_on_hand: roundQty(state.qty_on_hand),
          updated_at: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    if (doc) {
      balanceIdByKey.set(key, String(doc._id));
    }
  }

  return balanceIdByKey;
}

async function insertMissingTxns(
  ops: ReplayOp[],
  balanceIdByKey: Map<string, string>,
  fallbackUserId: string | null
) {
  let inserted = 0;
  let skippedExisting = 0;
  let skippedMissingUser = 0;

  for (const op of ops) {
    const key = balanceKey(op.holder_type, op.holder_id, op.consumable_id);
    const balanceId = balanceIdByKey.get(key);
    if (!balanceId) {
      continue;
    }

    const dedupeFilter: Record<string, unknown> = {
      balance_id: balanceId,
      event_type: op.event_type,
    };
    if (op.issue_id) {
      dedupeFilter.issue_id = op.issue_id;
    } else if (op.consumption_id) {
      dedupeFilter.consumption_id = op.consumption_id;
    } else {
      dedupeFilter.notes = op.marker;
    }

    const exists = await ConsumableBalanceTxnModel.exists(dedupeFilter);
    if (exists) {
      skippedExisting += 1;
      continue;
    }

    const performedByUserId = op.performed_by_user_id || fallbackUserId;
    if (!performedByUserId) {
      skippedMissingUser += 1;
      continue;
    }

    await ConsumableBalanceTxnModel.create({
      balance_id: balanceId,
      event_type: op.event_type,
      quantity: roundQty(op.quantity),
      issue_id: op.issue_id || null,
      lot_id: op.lot_id || null,
      consumption_id: op.consumption_id || null,
      performed_by_user_id: performedByUserId,
      performed_at: op.performed_at,
      notes: op.marker,
    });
    inserted += 1;
  }

  return { inserted, skippedExisting, skippedMissingUser };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.warn('WARNING: Back up your database before running this migration.');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN (writes enabled)'}`);

  const anomalies: Anomaly[] = [];

  try {
    await connectDatabase();

    const [moduleIssueRecords, moduleConsumptionRecords, moduleReturnRecords] =
      await Promise.all([
        buildModuleIssueRecords(anomalies),
        buildModuleConsumptionRecords(anomalies),
        buildModuleReturnRecords(anomalies),
      ]);

    const records = [
      ...moduleIssueRecords,
      ...moduleConsumptionRecords,
      ...moduleReturnRecords,
    ].sort((a, b) => {
      const t = a.performed_at.getTime() - b.performed_at.getTime();
      if (t !== 0) return t;
      const kind = a.source_kind.localeCompare(b.source_kind);
      if (kind !== 0) return kind;
      return a.source_id.localeCompare(b.source_id);
    });

    const replayResult = replay(records, anomalies);
    const { balances, accepted_ops, skipped_records } = replayResult;

    const eventCounts = accepted_ops.reduce<Record<string, number>>((acc, op) => {
      acc[op.event_type] = (acc[op.event_type] || 0) + 1;
      return acc;
    }, {});

    console.log('\nReplay input totals');
    console.log(`  Records scanned: ${records.length}`);
    console.log(`  Records skipped during replay: ${skipped_records}`);
    console.log(`  Accepted replay operations: ${accepted_ops.length}`);
    console.log(`  Balance buckets computed: ${balances.size}`);
    console.log(`  ISSUE_IN ops: ${eventCounts.ISSUE_IN || 0}`);
    console.log(`  CONSUME_OUT ops: ${eventCounts.CONSUME_OUT || 0}`);
    console.log(`  RETURN_OUT ops: ${eventCounts.RETURN_OUT || 0}`);
    console.log(`  RETURN_IN ops: ${eventCounts.RETURN_IN || 0}`);

    printTopAnomalies(anomalies);

    if (dryRun) {
      console.log('\nDry-run complete. No writes were applied.');
      return;
    }

    const balanceIdByKey = await upsertBalances(balances);
    const fallbackUserId = await resolveFallbackTxnUserId();
    if (!fallbackUserId) {
      console.warn('No fallback user available for txn records with missing performed_by_user_id.');
    }

    const txnWriteResult = await insertMissingTxns(accepted_ops, balanceIdByKey, fallbackUserId);

    console.log('\nWrite summary');
    console.log(`  Balances upserted: ${balanceIdByKey.size}`);
    console.log(`  Txns inserted: ${txnWriteResult.inserted}`);
    console.log(`  Txns skipped (already existed): ${txnWriteResult.skippedExisting}`);
    console.log(`  Txns skipped (missing user): ${txnWriteResult.skippedMissingUser}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
