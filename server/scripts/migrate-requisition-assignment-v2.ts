/* eslint-disable no-console */
require('tsx/cjs');

const mongoose = require('mongoose');
const { Types } = mongoose;
const { connectDatabase } = require('../src/config/db.ts');
const { RequisitionModel } = require('../src/models/requisition.model.ts');
const { RequisitionLineModel } = require('../src/models/requisitionLine.model.ts');
const { AssignmentModel } = require('../src/models/assignment.model.ts');
const { EmployeeModel } = require('../src/models/employee.model.ts');
const { UserModel } = require('../src/models/user.model.ts');
const { AssetModel } = require('../src/models/asset.model.ts');
const { AssetItemModel } = require('../src/models/assetItem.model.ts');
const { ConsumableItemModel } = require('../src/modules/consumables/models/consumableItem.model.ts');
const { AuditLogModel } = require('../src/models/auditLog.model.ts');
const { getAssetItemOfficeId } = require('../src/utils/assetHolder.ts');

const MOVEABLE = 'MOVEABLE';
const CONSUMABLE = 'CONSUMABLE';
const EMPLOYEE = 'EMPLOYEE';
const SUB_LOCATION = 'SUB_LOCATION';
const OPEN_ASSIGNMENT_STATUSES = new Set(['DRAFT', 'ISSUED', 'RETURN_REQUESTED']);
const MAX_UNRESOLVED_PREVIEW = 50;

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  let limit = null;
  if (limitArg) {
    const parsed = Number(limitArg.split('=')[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.floor(parsed);
    } else {
      console.log(`[WARN] Ignoring invalid --limit value: ${limitArg}`);
    }
  }
  return { dryRun, limit };
}

function toIdString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === 'object' && value._id) return toIdString(value._id);
  return String(value);
}

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function isObjectIdString(value) {
  return Boolean(value) && Types.ObjectId.isValid(String(value));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLineType(line) {
  const candidates = [line?.line_type, line?.lineType, line?.item_type, line?.itemType, line?.type];
  const raw = String(candidates.find((entry) => !isMissing(entry)) || '')
    .trim()
    .toUpperCase();
  if (raw === MOVEABLE) return MOVEABLE;
  if (raw === CONSUMABLE) return CONSUMABLE;
  return 'UNKNOWN';
}

function getRequesterEmployeeId(requisition) {
  const candidateFields = [
    'requested_by_employee_id',
    'requestedByEmployeeId',
    'requester_employee_id',
    'requesterEmployeeId',
    'requested_by',
    'requestedBy',
    'employee_id',
    'employeeId',
  ];

  for (const field of candidateFields) {
    const value = toIdString(requisition?.[field]);
    if (isObjectIdString(value)) {
      return String(value);
    }
  }
  return null;
}

function getRequisitionOfficeId(requisition) {
  const candidateFields = ['office_id', 'officeId', 'issuing_office_id', 'issuingOfficeId'];
  for (const field of candidateFields) {
    const value = toIdString(requisition?.[field]);
    if (isObjectIdString(value)) return String(value);
  }
  return null;
}

function pushUnresolved(target, value) {
  if (!value) return;
  target.push(String(value));
}

function printUnresolved(label, values) {
  const total = values.length;
  console.log(`\n${label}: ${total}`);
  if (total === 0) {
    console.log('  (none)');
    return;
  }
  const preview = values.slice(0, MAX_UNRESOLVED_PREVIEW);
  preview.forEach((entry) => console.log(`  - ${entry}`));
  if (total > MAX_UNRESOLVED_PREVIEW) {
    console.log(`  ...more (${total - MAX_UNRESOLVED_PREVIEW} additional)`);
  }
}

function hasTruthyHeadFlag(employee) {
  return Boolean(employee?.is_unit_head) || Boolean(employee?.is_head);
}

function hasHeadTitle(employee) {
  const fields = [employee?.job_title, employee?.designation, employee?.role];
  const text = fields
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (!text) return false;
  return /(office\s*head|head\b|unit\s*head|in[-\s]?charge|officer\s*in\s*charge)/i.test(text);
}

function makeSummary() {
  return {
    requisitions: {
      scanned: 0,
      updated: 0,
      skipped: 0,
      unresolved: [],
    },
    lines: {
      scanned: 0,
      mapped: 0,
      ambiguous: 0,
      unmapped: 0,
      unresolved: [],
      ambiguousIds: [],
      unmappedIds: [],
    },
    assignments: {
      scanned: 0,
      updated: 0,
      skipped: 0,
      legacyLinked: 0,
      unresolved: [],
    },
  };
}

async function runMigration() {
  const { dryRun, limit } = parseArgs(process.argv);
  console.warn('WARNING: Back up your database before running this migration.');
  console.log(`[DONE] Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE RUN (writes enabled)'}`);
  console.log(`[DONE] Limit: ${limit || 'none'}`);

  const summary = makeSummary();
  const officeHeadCache = new Map();
  const assetMatchCache = new Map();
  const consumableMatchCache = new Map();
  const legacyRequisitionCache = new Map();
  const legacyLineCache = new Map();

  async function resolveOfficeHeadEmployee(officeId) {
    if (!isObjectIdString(officeId)) {
      return { ok: false, reason: 'Invalid office id', employeeId: null, userId: null };
    }
    if (officeHeadCache.has(officeId)) {
      return officeHeadCache.get(officeId);
    }

    const officeObjectId = new Types.ObjectId(officeId);
    const scopeFilter = {
      $or: [{ location_id: officeObjectId }, { directorate_id: officeObjectId }, { office_id: officeObjectId }],
      is_active: { $ne: false },
    };

    const employees = await EmployeeModel.collection
      .find(scopeFilter, {
        projection: {
          _id: 1,
          user_id: 1,
          job_title: 1,
          designation: 1,
          role: 1,
          is_unit_head: 1,
          is_head: 1,
        },
      })
      .toArray();

    const employeeByUserId = new Map();
    const userIds = [];
    for (const employee of employees) {
      const userId = toIdString(employee.user_id);
      if (isObjectIdString(userId)) {
        employeeByUserId.set(String(userId), employee);
        userIds.push(new Types.ObjectId(String(userId)));
      }
    }

    const headUsers = userIds.length
      ? await UserModel.collection
          .find(
            {
              _id: { $in: userIds },
              role: 'office_head',
              is_active: true,
              $or: [{ location_id: officeObjectId }, { location_id: { $exists: false } }, { location_id: null }],
            },
            { projection: { _id: 1 } }
          )
          .toArray()
      : [];

    const roleBasedCandidates = headUsers
      .map((entry) => employeeByUserId.get(String(entry._id)))
      .filter(Boolean);

    if (roleBasedCandidates.length === 1) {
      const selected = {
        ok: true,
        reason: 'Resolved from user.role=office_head',
        employeeId: String(roleBasedCandidates[0]._id),
        userId: toIdString(roleBasedCandidates[0].user_id),
      };
      officeHeadCache.set(officeId, selected);
      return selected;
    }

    if (roleBasedCandidates.length > 1) {
      const ambiguous = {
        ok: false,
        reason: `Ambiguous office head candidates from user role (${roleBasedCandidates.length})`,
        employeeId: null,
        userId: null,
      };
      officeHeadCache.set(officeId, ambiguous);
      return ambiguous;
    }

    const titleCandidates = employees.filter((employee) => hasTruthyHeadFlag(employee) || hasHeadTitle(employee));
    if (titleCandidates.length === 1) {
      const selected = {
        ok: true,
        reason: 'Resolved from employee head designation fields',
        employeeId: String(titleCandidates[0]._id),
        userId: toIdString(titleCandidates[0].user_id),
      };
      officeHeadCache.set(officeId, selected);
      return selected;
    }

    if (titleCandidates.length > 1) {
      const ambiguous = {
        ok: false,
        reason: `Ambiguous employee head candidates from designation/title (${titleCandidates.length})`,
        employeeId: null,
        userId: null,
      };
      officeHeadCache.set(officeId, ambiguous);
      return ambiguous;
    }

    const none = {
      ok: false,
      reason: 'No office head candidate found in employee/user data',
      employeeId: null,
      userId: null,
    };
    officeHeadCache.set(officeId, none);
    return none;
  }

  async function resolveUniqueByName(cache, model, name, labelPrefix) {
    const rawName = String(name || '');
    const trimmed = normalizeText(rawName);
    const cacheKey = trimmed.toLowerCase();
    if (!trimmed) {
      return { status: 'none', match: null, reason: 'Empty requested_name' };
    }
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const runMatch = async (query, label) => {
      const rows = await model.find(query, { _id: 1, name: 1 }).limit(2).lean();
      if (rows.length === 1) {
        return { status: 'unique', match: rows[0], reason: `${labelPrefix}:${label}` };
      }
      if (rows.length > 1) {
        return { status: 'ambiguous', match: null, reason: `${labelPrefix}:${label}` };
      }
      return null;
    };

    const exact = await runMatch({ name: rawName }, 'exact');
    if (exact) {
      cache.set(cacheKey, exact);
      return exact;
    }

    const ciExact = await runMatch({ name: { $regex: `^${escapeRegex(rawName)}$`, $options: 'i' } }, 'ci_exact');
    if (ciExact) {
      cache.set(cacheKey, ciExact);
      return ciExact;
    }

    const trimmedCi = await runMatch(
      { name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
      'trimmed_ci_exact'
    );
    if (trimmedCi) {
      cache.set(cacheKey, trimmedCi);
      return trimmedCi;
    }

    const none = { status: 'none', match: null, reason: `${labelPrefix}:no_match` };
    cache.set(cacheKey, none);
    return none;
  }

  async function ensureLegacyRequisition(officeId, headEmployeeId, submittedByUserId) {
    const cacheKey = `${officeId}`;
    if (legacyRequisitionCache.has(cacheKey)) {
      return legacyRequisitionCache.get(cacheKey);
    }
    const fileNumber = `LEGACY-${officeId}-001`;
    let requisition = await RequisitionModel.findOne({ file_number: fileNumber }).lean();
    if (!requisition && dryRun) {
      const simulated = {
        _id: new Types.ObjectId(),
        id: `dry-${fileNumber}`,
        file_number: fileNumber,
      };
      legacyRequisitionCache.set(cacheKey, simulated);
      return simulated;
    }
    if (!requisition) {
      try {
        const created = await RequisitionModel.create({
          file_number: fileNumber,
          office_id: new Types.ObjectId(officeId),
          issuing_office_id: new Types.ObjectId(officeId),
          requested_by_employee_id: new Types.ObjectId(headEmployeeId),
          target_type: EMPLOYEE,
          target_id: new Types.ObjectId(headEmployeeId),
          submitted_by_user_id: new Types.ObjectId(submittedByUserId),
          fulfilled_by_user_id: null,
          status: 'VERIFIED_APPROVED',
          remarks: 'LEGACY_MIGRATION_V2',
        });
        requisition = created.toJSON();
        console.log(
          `[MIGRATE][ASSIGNMENT] Created legacy requisition ${toIdString(created._id)} for office ${officeId}`
        );
      } catch (error) {
        if (error && error.code === 11000) {
          requisition = await RequisitionModel.findOne({ file_number: fileNumber }).lean();
        } else {
          throw error;
        }
      }
    }
    legacyRequisitionCache.set(cacheKey, requisition);
    return requisition;
  }

  async function ensureLegacyLineForAsset(requisitionId, assetId, assetName) {
    const cacheKey = `${requisitionId}:${assetId}`;
    if (legacyLineCache.has(cacheKey)) {
      return legacyLineCache.get(cacheKey);
    }
    let line = await RequisitionLineModel.findOne({
      requisition_id: new Types.ObjectId(requisitionId),
      line_type: MOVEABLE,
      asset_id: new Types.ObjectId(assetId),
    }).lean();
    if (!line && dryRun) {
      const simulated = {
        _id: new Types.ObjectId(),
        id: `dry-line-${assetId}`,
      };
      legacyLineCache.set(cacheKey, simulated);
      return simulated;
    }
    if (!line) {
      const created = await RequisitionLineModel.create({
        requisition_id: new Types.ObjectId(requisitionId),
        line_type: MOVEABLE,
        asset_id: new Types.ObjectId(assetId),
        consumable_id: null,
        requested_name: assetName || 'Legacy Asset',
        mapped_name: assetName || 'Legacy Asset',
        mapped_by_user_id: null,
        mapped_at: new Date(),
        requested_quantity: 1,
        approved_quantity: 1,
        fulfilled_quantity: 1,
        status: 'ASSIGNED',
        notes: 'LEGACY_MIGRATION_V2',
      });
      line = created.toJSON();
      console.log(
        `[MIGRATE][ASSIGNMENT] Created legacy requisition line ${toIdString(created._id)} for asset ${assetId}`
      );
    }
    legacyLineCache.set(cacheKey, line);
    return line;
  }

  async function migrateRequisitions() {
    const filter = {
      $or: [
        { target_type: { $exists: false } },
        { target_type: null },
        { target_type: '' },
        { target_id: { $exists: false } },
        { target_id: null },
        { target_id: '' },
      ],
    };
    const cursor = RequisitionModel.collection.find(filter);
    if (limit) cursor.limit(limit);
    const requisitions = await cursor.toArray();

    for (const requisition of requisitions) {
      summary.requisitions.scanned += 1;
      const reqId = String(requisition._id);
      try {
        const targetType = String(requisition.target_type || '').trim().toUpperCase();
        const targetId = toIdString(requisition.target_id);
        const hasTargetType = !isMissing(targetType);
        const hasTargetId = isObjectIdString(targetId);

        if (targetType === SUB_LOCATION) {
          console.log(`[SKIP][REQUISITION] ${reqId} target_type=SUB_LOCATION preserved`);
          summary.requisitions.skipped += 1;
          continue;
        }
        if (targetType === EMPLOYEE && hasTargetId) {
          console.log(`[SKIP][REQUISITION] ${reqId} already has EMPLOYEE target`);
          summary.requisitions.skipped += 1;
          continue;
        }

        const updateSet = {};
        let resolvedEmployeeId = getRequesterEmployeeId(requisition);
        if (resolvedEmployeeId) {
          console.log(`[MIGRATE][REQUISITION] ${reqId} using requester employee ${resolvedEmployeeId}`);
        } else {
          const officeId = getRequisitionOfficeId(requisition);
          if (!officeId) {
            const reason = `${reqId} missing requester and office id; cannot resolve target`;
            console.log(`[SKIP][REQUISITION] ${reason}`);
            pushUnresolved(summary.requisitions.unresolved, reason);
            summary.requisitions.skipped += 1;
            continue;
          }
          const headResolution = await resolveOfficeHeadEmployee(officeId);
          if (!headResolution.ok || !isObjectIdString(headResolution.employeeId)) {
            const reason = `${reqId} missing requester and cannot resolve office head (${headResolution.reason})`;
            console.log(`[SKIP][REQUISITION] ${reason}`);
            pushUnresolved(summary.requisitions.unresolved, reason);
            summary.requisitions.skipped += 1;
            continue;
          }
          resolvedEmployeeId = String(headResolution.employeeId);
          console.log(
            `[MIGRATE][REQUISITION] ${reqId} resolved office head employee ${resolvedEmployeeId} (${headResolution.reason})`
          );
        }

        if (!hasTargetType) updateSet.target_type = EMPLOYEE;
        if (!hasTargetId) updateSet.target_id = new Types.ObjectId(resolvedEmployeeId);

        if (Object.keys(updateSet).length === 0) {
          console.log(`[SKIP][REQUISITION] ${reqId} no missing target fields to update`);
          summary.requisitions.skipped += 1;
          continue;
        }

        if (dryRun) {
          console.log(`[MIGRATE][REQUISITION][DRY] ${reqId} would set ${JSON.stringify(updateSet)}`);
          summary.requisitions.updated += 1;
          continue;
        }

        const result = await RequisitionModel.updateOne({ _id: requisition._id }, { $set: updateSet });
        if (result.modifiedCount > 0) {
          console.log(`[MIGRATE][REQUISITION] ${reqId} updated`);
          summary.requisitions.updated += 1;
        } else {
          console.log(`[SKIP][REQUISITION] ${reqId} no write needed`);
          summary.requisitions.skipped += 1;
        }
      } catch (error) {
        const reason = `${reqId} error: ${error?.message || String(error)}`;
        console.log(`[WARN][REQUISITION] ${reason}`);
        pushUnresolved(summary.requisitions.unresolved, reason);
        summary.requisitions.skipped += 1;
      }
    }
  }

  async function migrateRequisitionLines() {
    const cursor = RequisitionLineModel.collection.find({});
    if (limit) cursor.limit(limit);
    const lines = await cursor.toArray();

    for (const line of lines) {
      summary.lines.scanned += 1;
      const lineId = String(line._id);
      try {
        const lineType = normalizeLineType(line);
        const requestedName = normalizeText(line.requested_name);
        const hasAssetId = isObjectIdString(toIdString(line.asset_id));
        const hasConsumableId = isObjectIdString(toIdString(line.consumable_id));

        if (lineType === MOVEABLE && hasAssetId) continue;
        if (lineType === CONSUMABLE && hasConsumableId) continue;

        if (lineType === 'UNKNOWN') {
          const reason = `${lineId} UNKNOWN_LINE_TYPE`;
          console.log(`[WARN][LINE] ${reason}`);
          summary.lines.unmapped += 1;
          pushUnresolved(summary.lines.unresolved, reason);
          pushUnresolved(summary.lines.unmappedIds, lineId);
          continue;
        }

        const resolver =
          lineType === MOVEABLE
            ? resolveUniqueByName(assetMatchCache, AssetModel, requestedName, 'asset')
            : resolveUniqueByName(consumableMatchCache, ConsumableItemModel, requestedName, 'consumable');
        const result = await resolver;

        if (result.status === 'ambiguous') {
          const reason = `${lineId} ${lineType} requested_name="${requestedName}" ambiguous`;
          console.log(`[WARN][LINE] ${reason}`);
          summary.lines.ambiguous += 1;
          pushUnresolved(summary.lines.unresolved, reason);
          pushUnresolved(summary.lines.ambiguousIds, lineId);
          continue;
        }

        if (result.status === 'none' || !result.match) {
          const reason = `${lineId} ${lineType} requested_name="${requestedName}" no confident match`;
          console.log(`[WARN][LINE] ${reason}`);
          summary.lines.unmapped += 1;
          pushUnresolved(summary.lines.unresolved, reason);
          pushUnresolved(summary.lines.unmappedIds, lineId);
          continue;
        }

        const now = new Date();
        const updateSet =
          lineType === MOVEABLE
            ? {
                asset_id: result.match._id,
                consumable_id: null,
                mapped_name: String(result.match.name || requestedName || '').trim() || null,
                mapped_by_user_id: null,
                mapped_at: now,
              }
            : {
                consumable_id: result.match._id,
                asset_id: null,
                mapped_name: String(result.match.name || requestedName || '').trim() || null,
                mapped_by_user_id: null,
                mapped_at: now,
              };

        if (dryRun) {
          console.log(`[MIGRATE][LINE][DRY] ${lineId} would set ${JSON.stringify(updateSet)}`);
          summary.lines.mapped += 1;
          continue;
        }

        const resultWrite = await RequisitionLineModel.updateOne({ _id: line._id }, { $set: updateSet });
        if (resultWrite.modifiedCount > 0) {
          console.log(`[MIGRATE][LINE] ${lineId} mapped (${lineType}) -> ${result.match.name}`);
          summary.lines.mapped += 1;
        } else {
          console.log(`[SKIP][LINE] ${lineId} write not required`);
        }
      } catch (error) {
        const reason = `${lineId} error: ${error?.message || String(error)}`;
        console.log(`[WARN][LINE] ${reason}`);
        summary.lines.unmapped += 1;
        pushUnresolved(summary.lines.unresolved, reason);
        pushUnresolved(summary.lines.unmappedIds, lineId);
      }
    }
  }

  async function deriveAssignmentLinkFromAudit(assignmentId) {
    const log = await AuditLogModel.collection.findOne(
      {
        entity_type: 'Assignment',
        entity_id: new Types.ObjectId(assignmentId),
        'diff.requisitionId': { $exists: true },
        'diff.requisitionLineId': { $exists: true },
      },
      {
        sort: { timestamp: -1, created_at: -1 },
        projection: { diff: 1 },
      }
    );
    if (!log?.diff) return null;
    const requisitionId = toIdString(log.diff.requisitionId);
    const requisitionLineId = toIdString(log.diff.requisitionLineId);
    if (!isObjectIdString(requisitionId) || !isObjectIdString(requisitionLineId)) return null;
    const line = await RequisitionLineModel.findById(requisitionLineId, { requisition_id: 1 }).lean();
    if (!line) return null;
    if (String(line.requisition_id) !== String(requisitionId)) return null;
    return {
      requisitionId: String(requisitionId),
      requisitionLineId: String(requisitionLineId),
      source: 'audit_log',
    };
  }

  async function deriveAssignmentLinkFromLine(assignment) {
    const lineId = toIdString(assignment.requisition_line_id);
    if (!isObjectIdString(lineId)) return null;
    const line = await RequisitionLineModel.findById(lineId, { requisition_id: 1 }).lean();
    if (!line) return null;
    return {
      requisitionId: String(line.requisition_id),
      requisitionLineId: String(lineId),
      source: 'line_lookup',
    };
  }

  async function ensureLegacyLinkForAssignment(assignment, assignmentId) {
    const assetItemId = toIdString(assignment.asset_item_id);
    if (!isObjectIdString(assetItemId)) {
      return { ok: false, reason: `${assignmentId} missing asset_item_id` };
    }
    const assetItem = await AssetItemModel.findById(assetItemId, {
      _id: 1,
      asset_id: 1,
      holder_type: 1,
      holder_id: 1,
      location_id: 1,
    }).lean();
    if (!assetItem) {
      return { ok: false, reason: `${assignmentId} asset item not found (${assetItemId})` };
    }
    const officeId = getAssetItemOfficeId(assetItem);
    if (!isObjectIdString(officeId)) {
      return { ok: false, reason: `${assignmentId} cannot resolve office from asset item ${assetItemId}` };
    }

    const headResolution = await resolveOfficeHeadEmployee(officeId);
    if (!headResolution.ok || !isObjectIdString(headResolution.employeeId)) {
      return { ok: false, reason: `${assignmentId} cannot resolve office head for office ${officeId}` };
    }
    if (!isObjectIdString(headResolution.userId)) {
      return { ok: false, reason: `${assignmentId} office head employee has no user_id for office ${officeId}` };
    }

    const legacyRequisition = await ensureLegacyRequisition(
      officeId,
      String(headResolution.employeeId),
      String(headResolution.userId)
    );
    const legacyReqId = toIdString(legacyRequisition?._id || legacyRequisition?.id);
    if (!isObjectIdString(legacyReqId)) {
      return { ok: false, reason: `${assignmentId} failed to resolve/create legacy requisition` };
    }

    const assetId = toIdString(assetItem.asset_id);
    if (!isObjectIdString(assetId)) {
      return { ok: false, reason: `${assignmentId} asset item ${assetItemId} missing asset_id` };
    }
    const asset = await AssetModel.findById(assetId, { name: 1 }).lean();
    const assetName = normalizeText(asset?.name) || 'Legacy Asset';
    const legacyLine = await ensureLegacyLineForAsset(legacyReqId, assetId, assetName);
    const legacyLineId = toIdString(legacyLine?._id || legacyLine?.id);
    if (!isObjectIdString(legacyLineId)) {
      return { ok: false, reason: `${assignmentId} failed to resolve/create legacy line` };
    }

    return {
      ok: true,
      requisitionId: legacyReqId,
      requisitionLineId: legacyLineId,
      reason: `legacy fallback for office ${officeId}`,
    };
  }

  async function migrateAssignments() {
    const cursor = AssignmentModel.collection.find({});
    if (limit) cursor.limit(limit);
    const assignments = await cursor.toArray();

    for (const assignment of assignments) {
      summary.assignments.scanned += 1;
      const assignmentId = String(assignment._id);
      try {
        const updateSet = {};
        const status = String(assignment.status || '').trim().toUpperCase();
        const hasStatus = ['DRAFT', 'ISSUED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED'].includes(status);
        if (!hasStatus) {
          const inferredStatus = assignment.is_active === true ? 'ISSUED' : 'RETURNED';
          updateSet.status = inferredStatus;
          updateSet.is_active = OPEN_ASSIGNMENT_STATUSES.has(inferredStatus);
          console.log(`[MIGRATE][ASSIGNMENT] ${assignmentId} inferred status=${inferredStatus}`);
        }

        const assignedToType = String(assignment.assigned_to_type || '').trim().toUpperCase();
        const assignedToId = toIdString(assignment.assigned_to_id);
        const hasAssignedToType = assignedToType === EMPLOYEE || assignedToType === SUB_LOCATION;
        const hasAssignedToId = isObjectIdString(assignedToId);
        const employeeId = toIdString(assignment.employee_id);

        if ((!hasAssignedToType || !hasAssignedToId) && isObjectIdString(employeeId)) {
          if (!hasAssignedToType) updateSet.assigned_to_type = EMPLOYEE;
          if (!hasAssignedToId) updateSet.assigned_to_id = new Types.ObjectId(String(employeeId));
        } else if (!hasAssignedToType || !hasAssignedToId) {
          const reason = `${assignmentId} missing employee_id; cannot set assigned_to_*`;
          console.log(`[SKIP][ASSIGNMENT] ${reason}`);
          pushUnresolved(summary.assignments.unresolved, reason);
        }

        const existingReqId = toIdString(assignment.requisition_id);
        const existingLineId = toIdString(assignment.requisition_line_id);
        const hasReq = isObjectIdString(existingReqId);
        const hasLine = isObjectIdString(existingLineId);

        if (!(hasReq && hasLine)) {
          let linkResolution = null;
          if (hasLine) {
            linkResolution = await deriveAssignmentLinkFromLine(assignment);
          }
          if (!linkResolution) {
            linkResolution = await deriveAssignmentLinkFromAudit(assignmentId);
          }

          if (linkResolution) {
            if (!hasReq) updateSet.requisition_id = new Types.ObjectId(linkResolution.requisitionId);
            if (!hasLine) updateSet.requisition_line_id = new Types.ObjectId(linkResolution.requisitionLineId);
            console.log(
              `[MIGRATE][ASSIGNMENT] ${assignmentId} linked requisition refs from ${linkResolution.source}`
            );
          } else {
            const legacyResolution = await ensureLegacyLinkForAssignment(assignment, assignmentId);
            if (legacyResolution.ok) {
              if (!hasReq) updateSet.requisition_id = new Types.ObjectId(legacyResolution.requisitionId);
              if (!hasLine) updateSet.requisition_line_id = new Types.ObjectId(legacyResolution.requisitionLineId);
              summary.assignments.legacyLinked += 1;
              console.log(`[MIGRATE][ASSIGNMENT] ${assignmentId} linked using ${legacyResolution.reason}`);
            } else {
              const reason = `${assignmentId} ${legacyResolution.reason}`;
              console.log(`[SKIP][ASSIGNMENT] ${reason}`);
              pushUnresolved(summary.assignments.unresolved, reason);
            }
          }
        }

        if (Object.keys(updateSet).length === 0) {
          summary.assignments.skipped += 1;
          continue;
        }

        if (dryRun) {
          console.log(`[MIGRATE][ASSIGNMENT][DRY] ${assignmentId} would set ${JSON.stringify(updateSet)}`);
          summary.assignments.updated += 1;
          continue;
        }

        const result = await AssignmentModel.updateOne({ _id: assignment._id }, { $set: updateSet });
        if (result.modifiedCount > 0) {
          console.log(`[MIGRATE][ASSIGNMENT] ${assignmentId} updated`);
          summary.assignments.updated += 1;
        } else {
          console.log(`[SKIP][ASSIGNMENT] ${assignmentId} no write needed`);
          summary.assignments.skipped += 1;
        }
      } catch (error) {
        const reason = `${assignmentId} error: ${error?.message || String(error)}`;
        console.log(`[WARN][ASSIGNMENT] ${reason}`);
        summary.assignments.skipped += 1;
        pushUnresolved(summary.assignments.unresolved, reason);
      }
    }
  }

  try {
    await connectDatabase();
    await migrateRequisitions();
    await migrateRequisitionLines();
    await migrateAssignments();

    console.log('\n[DONE] Summary');
    console.table([
      {
        collection: 'requisitions',
        scanned: summary.requisitions.scanned,
        updated: summary.requisitions.updated,
        skipped: summary.requisitions.skipped,
      },
      {
        collection: 'requisition_lines',
        scanned: summary.lines.scanned,
        mapped: summary.lines.mapped,
        ambiguous: summary.lines.ambiguous,
        unmapped: summary.lines.unmapped,
      },
      {
        collection: 'assignments',
        scanned: summary.assignments.scanned,
        updated: summary.assignments.updated,
        skipped: summary.assignments.skipped,
        legacy_linked: summary.assignments.legacyLinked,
      },
    ]);

    printUnresolved('[DONE] Requisition unresolved (first 50)', summary.requisitions.unresolved);
    printUnresolved('[DONE] Line ambiguous IDs (first 50)', summary.lines.ambiguousIds);
    printUnresolved('[DONE] Line unmapped IDs (first 50)', summary.lines.unmappedIds);
    printUnresolved('[DONE] Assignment unresolved (first 50)', summary.assignments.unresolved);
  } catch (error) {
    console.log(`[WARN] Migration failed: ${error?.message || String(error)}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

runMigration();
