import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import mongoose from 'mongoose';

const require = createRequire(import.meta.url);
const { connectDatabase } = require('../server/src/config/db');
const { AssetModel } = require('../server/src/models/asset.model');
const { AssetItemModel } = require('../server/src/models/assetItem.model');
const { CategoryModel } = require('../server/src/models/category.model');
const { OfficeModel } = require('../server/src/models/office.model');

type RawWorkbookRow = {
  sourceFile: string;
  rowNumber: number;
  data: Record<string, string>;
};

type ParsedWorkbookPayload = {
  rows: RawWorkbookRow[];
};

type NormalizedRow = {
  sourceFile: string;
  rowNumber: number;
  assetName: string;
  description: string;
  categoryName: string;
  subCategory: string | null;
  uniqueIdentificationNumber: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  rawDate: string | null;
  operationalCount: number;
  needRepairCount: number;
  nonRepairableCount: number;
  officeName: string | null;
  originalOfficeName: string | null;
  division: string | null;
};

type RowIssueKind =
  | 'missing_asset_name'
  | 'missing_category'
  | 'missing_office'
  | 'unknown_office_type'
  | 'zero_quantity'
  | 'quantity_available_exceeds_received'
  | 'quantity_status_mismatch'
  | 'malformed_date';

type RowIssue = {
  kind: RowIssueKind;
  file: string;
  row: number;
  asset: string;
  office: string | null;
  detail: string;
  rawValue?: string | null;
};

type DateParseResult = {
  value: Date | null;
  issue: RowIssue | null;
};

type OfficeSeedPlan = {
  id: string;
  name: string;
  type: 'HEAD_OFFICE' | 'DIRECTORATE' | 'DISTRICT_OFFICE' | 'DISTRICT_LAB';
  district: string | null;
  division: string | null;
};

type CategorySeedPlan = {
  id: string;
  name: string;
};

type AssetAggregate = {
  key: string;
  id: string;
  name: string;
  description: string | null;
  specification: string | null;
  categoryId: string;
  quantity: number;
  earliestAcquisitionDate: Date | null;
};

type SeedableRow = {
  row: NormalizedRow;
  officeId: string;
  categoryId: string;
  assetKey: string;
  parsedDate: Date | null;
  rawDateIssue: RowIssue | null;
};

type QuantityIssueSummary = {
  file: string;
  row: number;
  asset: string;
  office: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  operational: number;
  needRepair: number;
  nonRepairable: number;
  statusTotal: number;
  issue: string;
};

const WORKBOOK_BASE_DIR = path.resolve('C:\\Users\\IS\\OneDrive\\Music\\FInal Cleaned Data');
const WORKBOOK_FILES = [
  path.join(WORKBOOK_BASE_DIR, '1. District Wise Assets.xlsx'),
  path.join(WORKBOOK_BASE_DIR, '2. Lab Assets.xlsx'),
];
const PYTHON_HELPER = path.resolve('scripts', 'extract_asset_workbooks.py');
const IMPORT_SOURCE = 'Spreadsheet Import';

const COLUMN_MAPPING = [
  { source: '#', target: 'ignored', seedable: 'No', notes: 'Spreadsheet row number only.' },
  { source: 'Name of Asset', target: 'Asset.name', seedable: 'Yes', notes: 'Direct master asset name.' },
  { source: 'Description', target: 'Asset.description', seedable: 'Yes', notes: 'Direct description.' },
  { source: 'Category', target: 'Asset.category_id', seedable: 'Yes', notes: 'Resolved through Category lookup or creation.' },
  { source: 'Sub-Category', target: 'Asset.specification', seedable: 'Partial', notes: 'Stored as specification text.' },
  {
    source: 'Unique Identification Number',
    target: 'AssetItem.serial_number',
    seedable: 'Partial',
    notes: 'Only when a real identifier is present and can be assigned safely.',
  },
  {
    source: 'Quantity Received',
    target: 'Asset.quantity and AssetItem count',
    seedable: 'Yes',
    notes: 'Drives item creation count for safe rows.',
  },
  {
    source: 'Quantity Available',
    target: 'validation only',
    seedable: 'No direct field',
    notes: 'Used to detect broken rows, not stored directly.',
  },
  {
    source: 'Date Received',
    target: 'Asset.acquisition_date and AssetItem.purchase_date',
    seedable: 'Partial',
    notes: 'Single valid dates are seeded; malformed multi-date values are left null and reported.',
  },
  {
    source: 'Operational',
    target: 'AssetItem status split',
    seedable: 'Yes',
    notes: 'Mapped to Available / Functional items.',
  },
  {
    source: 'Need Repair',
    target: 'AssetItem status split',
    seedable: 'Yes',
    notes: 'Mapped to Maintenance / Need Repairs items.',
  },
  {
    source: 'Non Repairable',
    target: 'AssetItem status split',
    seedable: 'Yes',
    notes: 'Mapped to Damaged / Dead items.',
  },
  {
    source: 'EPA Office Name And District',
    target: 'AssetItem holder OFFICE',
    seedable: 'Yes',
    notes: 'Resolved through Office lookup or creation.',
  },
  {
    source: 'Division',
    target: 'Office.division',
    seedable: 'Partial',
    notes: 'Used only when creating or enriching office metadata.',
  },
];

function normalizeWhitespace(value: unknown) {
  return String(value ?? '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value: unknown) {
  return normalizeWhitespace(value).toLowerCase();
}

function parseNumber(value: unknown) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function isPlaceholderIdentifier(value: string | null) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/^[\-_/.,\s]+$/.test(normalized)) return true;
  return ['n/a', 'na', 'nil', 'none', 'not available', 'ids'].includes(normalized);
}

function canonicalizeOfficeName(value: string | null) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  if (normalizeKey(normalized) === 'district office murre') {
    return 'District Office Murree';
  }
  return normalized;
}

function inferOfficeType(
  officeName: string | null
): 'HEAD_OFFICE' | 'DIRECTORATE' | 'DISTRICT_OFFICE' | 'DISTRICT_LAB' | null {
  const normalized = normalizeKey(officeName);
  if (!normalized) return null;
  if (normalized.startsWith('district lab ')) return 'DISTRICT_LAB';
  if (normalized.startsWith('district office ')) return 'DISTRICT_OFFICE';
  if (normalized.endsWith(' division')) return 'DIRECTORATE';
  return null;
}

function inferDistrict(officeName: string | null) {
  const normalized = normalizeWhitespace(officeName);
  if (!normalized) return null;
  if (/^District Lab /i.test(normalized)) return normalized.replace(/^District Lab /i, '').trim();
  if (/^District Office /i.test(normalized)) return normalized.replace(/^District Office /i, '').trim();
  if (/ Division$/i.test(normalized)) return normalized.replace(/ Division$/i, '').trim();
  return null;
}

function buildCapabilities(type: OfficeSeedPlan['type']) {
  if (type === 'DISTRICT_LAB') {
    return { moveables: true, consumables: true, chemicals: true };
  }
  return { moveables: true, consumables: true, chemicals: false };
}

function excelSerialToDate(serial: number) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86_400 * 1000;
  return new Date(utcValue);
}

function parseStructuredDate(day: number, month: number, year: number) {
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function parseDateCell(row: NormalizedRow): DateParseResult {
  const raw = normalizeWhitespace(row.rawDate);
  if (!raw) {
    return { value: null, issue: null };
  }

  if (/^\d{5}$/.test(raw)) {
    return { value: excelSerialToDate(Number(raw)), issue: null };
  }

  const simpleMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (simpleMatch) {
    const [, dayPart, monthPart, yearPart] = simpleMatch;
    const year = yearPart.length === 2 ? Number(`20${yearPart}`) : Number(yearPart);
    const parsed = parseStructuredDate(Number(dayPart), Number(monthPart), year);
    if (parsed) {
      return { value: parsed, issue: null };
    }
  }

  const containsMultipleDates =
    /[,&;]/.test(raw) ||
    /\bto\b/i.test(raw) ||
    /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}.*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(raw) ||
    /\b\d{4}\b.*\b\d{4}\b/.test(raw);

  const issue: RowIssue = {
    kind: 'malformed_date',
    file: row.sourceFile,
    row: row.rowNumber,
    asset: row.assetName,
    office: row.officeName,
    detail: containsMultipleDates
      ? 'Date cell contains multiple values or a range, so there is no single safe acquisition date.'
      : 'Date cell is not parseable as a single date.',
    rawValue: raw,
  };

  return { value: null, issue };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitIdentifiers(value: string | null, quantity: number) {
  if (!value || isPlaceholderIdentifier(value)) {
    return { serials: Array.from({ length: quantity }, () => null), issue: null as string | null };
  }

  const cleaned = value.replace(/^ids\b[:\s-]*/i, '').trim();
  if (quantity === 1) {
    return { serials: [cleaned], issue: null as string | null };
  }

  const delimiterTokens = cleaned
    .split(/[\n,;&]+/)
    .map((token) => normalizeWhitespace(token))
    .filter(Boolean);

  if (delimiterTokens.length === quantity) {
    return { serials: delimiterTokens, issue: null as string | null };
  }

  const spaceTokens = cleaned
    .split(/\s+/)
    .map((token) => normalizeWhitespace(token))
    .filter(Boolean);

  if (spaceTokens.length === quantity && !spaceTokens.some((token) => isPlaceholderIdentifier(token))) {
    return { serials: spaceTokens, issue: null as string | null };
  }

  return {
    serials: Array.from({ length: quantity }, () => null),
    issue: `Identifier value could not be split safely across ${quantity} items: ${cleaned}`,
  };
}

function buildSourceRef(row: NormalizedRow) {
  return `${row.sourceFile}#row-${row.rowNumber}`;
}

function buildMasterKey(row: NormalizedRow, categoryId: string) {
  const specification = row.subCategory ? `Sub-Category: ${row.subCategory}` : '';
  return [
    normalizeKey(row.assetName),
    normalizeKey(row.description),
    categoryId,
    normalizeKey(specification),
  ].join('|');
}

function normalizeRow(rawRow: RawWorkbookRow): NormalizedRow {
  const rawOfficeName = normalizeWhitespace(rawRow.data['EPA Office Name And District']);
  const canonicalOffice = canonicalizeOfficeName(rawOfficeName || null);

  return {
    sourceFile: rawRow.sourceFile,
    rowNumber: rawRow.rowNumber,
    assetName: normalizeWhitespace(rawRow.data['Name of Asset']),
    description: normalizeWhitespace(rawRow.data['Description']),
    categoryName: normalizeWhitespace(rawRow.data['Category']),
    subCategory: normalizeWhitespace(rawRow.data['Sub-Category']) || null,
    uniqueIdentificationNumber: normalizeWhitespace(rawRow.data['Unique Identification Number']) || null,
    quantityReceived: parseNumber(rawRow.data['Quantity Received']),
    quantityAvailable: parseNumber(rawRow.data['Quantity Available']),
    rawDate: normalizeWhitespace(rawRow.data['Date Received']) || null,
    operationalCount: parseNumber(rawRow.data['Operational']),
    needRepairCount: parseNumber(rawRow.data['Need Repair']),
    nonRepairableCount: parseNumber(rawRow.data['Non Repairable']),
    officeName: canonicalOffice,
    originalOfficeName: rawOfficeName || null,
    division: normalizeWhitespace(rawRow.data['Division']) || null,
  };
}

function loadWorkbookRows() {
  const rawJson = execFileSync('python', [PYTHON_HELPER, ...WORKBOOK_FILES], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const payload = JSON.parse(rawJson) as ParsedWorkbookPayload;
  return payload.rows.map(normalizeRow);
}

function classifyRows(rows: NormalizedRow[]) {
  const issues: RowIssue[] = [];
  const quantityIssueRows: QuantityIssueSummary[] = [];
  const seedableRows: NormalizedRow[] = [];

  for (const row of rows) {
    if (!row.assetName) {
      issues.push({
        kind: 'missing_asset_name',
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        detail: 'Asset name is blank.',
      });
      continue;
    }

    if (!row.categoryName) {
      issues.push({
        kind: 'missing_category',
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        detail: 'Category is blank.',
      });
      continue;
    }

    if (!row.officeName) {
      issues.push({
        kind: 'missing_office',
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        detail: 'Office is blank.',
      });
      continue;
    }

    if (!inferOfficeType(row.officeName)) {
      issues.push({
        kind: 'unknown_office_type',
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        detail: 'Office name does not map cleanly to a canonical office type.',
      });
      continue;
    }

    if (row.quantityReceived <= 0) {
      issues.push({
        kind: 'zero_quantity',
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        detail: 'Quantity received is zero or negative.',
      });
      continue;
    }

    if (row.quantityAvailable > row.quantityReceived) {
      issues.push({
        kind: 'quantity_available_exceeds_received',
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        detail: 'Quantity available is greater than quantity received.',
      });
      quantityIssueRows.push({
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        quantityReceived: row.quantityReceived,
        quantityAvailable: row.quantityAvailable,
        operational: row.operationalCount,
        needRepair: row.needRepairCount,
        nonRepairable: row.nonRepairableCount,
        statusTotal: row.operationalCount + row.needRepairCount + row.nonRepairableCount,
        issue: 'quantity_available_exceeds_received',
      });
      continue;
    }

    const statusTotal = row.operationalCount + row.needRepairCount + row.nonRepairableCount;
    if (statusTotal !== row.quantityReceived) {
      issues.push({
        kind: 'quantity_status_mismatch',
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        detail: `Operational + Need Repair + Non Repairable = ${statusTotal}, but Quantity Received = ${row.quantityReceived}.`,
      });
      quantityIssueRows.push({
        file: row.sourceFile,
        row: row.rowNumber,
        asset: row.assetName,
        office: row.officeName,
        quantityReceived: row.quantityReceived,
        quantityAvailable: row.quantityAvailable,
        operational: row.operationalCount,
        needRepair: row.needRepairCount,
        nonRepairable: row.nonRepairableCount,
        statusTotal,
        issue: 'quantity_status_mismatch',
      });
      continue;
    }

    seedableRows.push(row);
  }

  return { issues, quantityIssueRows, seedableRows };
}

async function resolveOfficePlans(rows: NormalizedRow[]) {
  const desiredOffices = new Map<string, { name: string; type: OfficeSeedPlan['type']; district: string | null; division: string | null }>();
  for (const row of rows) {
    if (!row.officeName) continue;
    const type = inferOfficeType(row.officeName);
    if (!type) continue;
    const key = normalizeKey(row.officeName);
    if (!desiredOffices.has(key)) {
      desiredOffices.set(key, {
        name: row.officeName,
        type,
        district: inferDistrict(row.officeName),
        division: row.division ?? inferDistrict(row.officeName),
      });
    }
  }

  const existing = await OfficeModel.find({ is_active: { $ne: false } })
    .select({ name: 1, type: 1, district: 1, division: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string; type?: string; district?: string | null; division?: string | null }>>();

  const plans = new Map<string, OfficeSeedPlan>();
  const existingByName = new Map(existing.map((office) => [normalizeKey(office.name), office]));

  for (const office of desiredOffices.values()) {
    const exact = existingByName.get(normalizeKey(office.name));
    if (exact) {
      plans.set(normalizeKey(office.name), {
        id: String(exact._id),
        name: normalizeWhitespace(exact.name),
        type: exact.type as OfficeSeedPlan['type'],
        district: normalizeWhitespace(exact.district) || office.district,
        division: normalizeWhitespace(exact.division) || office.division,
      });
      continue;
    }

    const fuzzyCandidates = existing.filter((candidate) => {
      const sameType = normalizeKey(candidate.type) === normalizeKey(office.type);
      const sameDistrict = normalizeKey(candidate.district) === normalizeKey(office.district);
      return sameType && sameDistrict;
    });

    if (fuzzyCandidates.length === 1) {
      const candidate = fuzzyCandidates[0];
      plans.set(normalizeKey(office.name), {
        id: String(candidate._id),
        name: normalizeWhitespace(candidate.name),
        type: candidate.type as OfficeSeedPlan['type'],
        district: normalizeWhitespace(candidate.district) || office.district,
        division: normalizeWhitespace(candidate.division) || office.division,
      });
      continue;
    }

    const created = await OfficeModel.create({
      name: office.name,
      type: office.type,
      district: office.district,
      division: office.division,
      capabilities: buildCapabilities(office.type),
      is_active: true,
    });

    plans.set(normalizeKey(office.name), {
      id: String(created._id),
      name: created.name,
      type: created.type,
      district: created.district ?? null,
      division: created.division ?? null,
    });
  }

  return plans;
}

async function resolveCategoryPlans(rows: NormalizedRow[]) {
  const desiredNames = Array.from(new Set(rows.map((row) => row.categoryName).filter(Boolean)));
  const existing = await CategoryModel.find({
    name: { $in: desiredNames },
    asset_type: 'ASSET',
  })
    .select({ name: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string }>>();

  const plans = new Map<string, CategorySeedPlan>();
  for (const category of existing) {
    plans.set(normalizeKey(category.name), { id: String(category._id), name: normalizeWhitespace(category.name) });
  }

  for (const categoryName of desiredNames) {
    const key = normalizeKey(categoryName);
    if (plans.has(key)) continue;
    const created = await CategoryModel.create({
      name: categoryName,
      asset_type: 'ASSET',
      scope: 'GENERAL',
      description: 'Imported from workbook asset seed.',
    });
    plans.set(key, { id: String(created._id), name: created.name });
  }

  return plans;
}

async function upsertAssets(seedableRows: SeedableRow[]) {
  const aggregates = new Map<string, AssetAggregate>();

  for (const seedableRow of seedableRows) {
    const row = seedableRow.row;
    const key = seedableRow.assetKey;
    if (!aggregates.has(key)) {
      aggregates.set(key, {
        key,
        id: '',
        name: row.assetName,
        description: row.description || null,
        specification: row.subCategory ? `Sub-Category: ${row.subCategory}` : null,
        categoryId: seedableRow.categoryId,
        quantity: 0,
        earliestAcquisitionDate: null,
      });
    }
    const aggregate = aggregates.get(key)!;
    aggregate.quantity += row.quantityReceived;
    if (seedableRow.parsedDate && (!aggregate.earliestAcquisitionDate || seedableRow.parsedDate < aggregate.earliestAcquisitionDate)) {
      aggregate.earliestAcquisitionDate = seedableRow.parsedDate;
    }
  }

  for (const aggregate of aggregates.values()) {
    const existing = await AssetModel.findOne({
      name: aggregate.name,
      description: aggregate.description,
      specification: aggregate.specification,
      category_id: aggregate.categoryId,
      asset_source: IMPORT_SOURCE,
    });

    if (existing) {
      existing.quantity = aggregate.quantity;
      existing.acquisition_date = aggregate.earliestAcquisitionDate;
      existing.currency = 'PKR';
      await existing.save();
      aggregate.id = String(existing._id);
      continue;
    }

    const created = await AssetModel.create({
      name: aggregate.name,
      description: aggregate.description,
      specification: aggregate.specification,
      category_id: aggregate.categoryId,
      asset_source: IMPORT_SOURCE,
      acquisition_date: aggregate.earliestAcquisitionDate,
      quantity: aggregate.quantity,
      currency: 'PKR',
      is_active: true,
    });
    aggregate.id = String(created._id);
  }

  return aggregates;
}

function buildItemDocs(params: {
  row: NormalizedRow;
  officeId: string;
  assetId: string;
  startingSequence: number;
  parsedDate: Date | null;
  rawDateIssue: RowIssue | null;
}) {
  const row = params.row;
  const statuses = [
    {
      count: row.operationalCount,
      itemStatus: 'Available',
      itemCondition: 'Good',
      functionalStatus: 'Functional',
    },
    {
      count: row.needRepairCount,
      itemStatus: 'Maintenance',
      itemCondition: 'Poor',
      functionalStatus: 'Need Repairs',
    },
    {
      count: row.nonRepairableCount,
      itemStatus: 'Damaged',
      itemCondition: 'Damaged',
      functionalStatus: 'Dead',
    },
  ];

  const sourceRef = buildSourceRef(row);
  const serialPlan = splitIdentifiers(row.uniqueIdentificationNumber, row.quantityReceived);
  let serialIndex = 0;
  let sequence = params.startingSequence;
  const docs: Array<Record<string, unknown>> = [];

  for (const status of statuses) {
    for (let index = 0; index < status.count; index += 1) {
      const noteParts = [
        `Import source: ${sourceRef}`,
        `Original office: ${row.originalOfficeName ?? row.officeName}`,
      ];
      if (row.subCategory) {
        noteParts.push(`Original sub-category: ${row.subCategory}`);
      }
      if (params.rawDateIssue?.rawValue) {
        noteParts.push(`Original date value: ${params.rawDateIssue.rawValue}`);
      }
      if (serialPlan.issue) {
        noteParts.push(serialPlan.issue);
      }

      docs.push({
        asset_id: params.assetId,
        holder_type: 'OFFICE',
        holder_id: params.officeId,
        serial_number: serialPlan.serials[serialIndex] ?? null,
        tag: `AST-${params.assetId.slice(-6).toUpperCase()}-${String(sequence).padStart(4, '0')}`,
        assignment_status: 'Unassigned',
        item_status: status.itemStatus,
        item_condition: status.itemCondition,
        functional_status: status.functionalStatus,
        item_source: 'Purchased',
        purchase_date: params.parsedDate,
        notes: noteParts.join(' | '),
        is_active: true,
      });
      serialIndex += 1;
      sequence += 1;
    }
  }

  return { docs, nextSequence: sequence };
}

async function seedItems(seedableRows: SeedableRow[], assetAggregates: Map<string, AssetAggregate>) {
  const createdItemsByRow: Array<{ sourceRef: string; created: number }> = [];
  const assetSequences = new Map<string, number>();

  for (const seedableRow of seedableRows) {
    const row = seedableRow.row;
    const sourceRef = buildSourceRef(row);
    const sourcePattern = new RegExp(escapeRegExp(sourceRef));
    const existingRowItemCount = await AssetItemModel.countDocuments({ notes: sourcePattern });
    if (existingRowItemCount >= row.quantityReceived) {
      createdItemsByRow.push({ sourceRef, created: 0 });
      continue;
    }

    const aggregate = assetAggregates.get(seedableRow.assetKey);
    if (!aggregate?.id) {
      throw new Error(`Missing asset aggregate for ${sourceRef}`);
    }

    if (!assetSequences.has(aggregate.id)) {
      const existingCount = await AssetItemModel.countDocuments({ asset_id: aggregate.id });
      assetSequences.set(aggregate.id, existingCount + 1);
    }

    const startingSequence = assetSequences.get(aggregate.id)!;
    const { docs, nextSequence } = buildItemDocs({
      row,
      officeId: seedableRow.officeId,
      assetId: aggregate.id,
      startingSequence,
      parsedDate: seedableRow.parsedDate,
      rawDateIssue: seedableRow.rawDateIssue,
    });

    if (docs.length === 0) {
      createdItemsByRow.push({ sourceRef, created: 0 });
      continue;
    }

    await AssetItemModel.insertMany(docs, { ordered: true });
    assetSequences.set(aggregate.id, nextSequence);
    createdItemsByRow.push({ sourceRef, created: docs.length });
  }

  return createdItemsByRow;
}

function printColumnMapping() {
  console.log('\nColumn mapping:');
  for (const mapping of COLUMN_MAPPING) {
    console.log(`- ${mapping.source} -> ${mapping.target} | seedable: ${mapping.seedable} | ${mapping.notes}`);
  }
}

function printIssueOptions(quantityIssues: QuantityIssueSummary[], malformedDateIssues: RowIssue[]) {
  if (quantityIssues.length > 0) {
    console.log('\nBroken quantity math rows:');
    for (const issue of quantityIssues) {
      console.log(
        `- ${issue.file} row ${issue.row} | ${issue.asset} | ${issue.office ?? 'Unknown office'} | ` +
          `received=${issue.quantityReceived}, available=${issue.quantityAvailable}, operational=${issue.operational}, ` +
          `needRepair=${issue.needRepair}, nonRepairable=${issue.nonRepairable}, statusTotal=${issue.statusTotal} | ${issue.issue}`
      );
    }
    console.log('  Default used: skipped these rows.');
    console.log('  Options:');
    console.log('  1. Trust quantity received and rebalance statuses.');
    console.log('  2. Trust status counts and override quantity received.');
    console.log('  3. Seed master asset only and skip item rows.');
    console.log('  4. Keep current behavior and skip the row entirely.');
  }

  if (malformedDateIssues.length > 0) {
    console.log('\nMalformed or multi-date rows:');
    for (const issue of malformedDateIssues) {
      console.log(
        `- ${issue.file} row ${issue.row} | ${issue.asset} | ${issue.office ?? 'Unknown office'} | raw date: ${issue.rawValue ?? ''}`
      );
    }
    console.log('  Default used: seeded these rows with a null acquisition/purchase date and preserved the raw date in item notes.');
    console.log('  Options:');
    console.log('  1. Keep null dates and preserve the raw source text.');
    console.log('  2. Use the earliest valid date in each multi-date cell.');
    console.log('  3. Use the latest valid date in each multi-date cell.');
    console.log('  4. Split each multi-date row into separate acquisitions.');
    console.log('  5. Skip these rows entirely.');
  }
}

async function run() {
  const rows = loadWorkbookRows();
  const { issues, quantityIssueRows, seedableRows: prelimSeedableRows } = classifyRows(rows);
  const malformedDateIssues: RowIssue[] = [];

  printColumnMapping();
  console.log(`\nWorkbook rows loaded: ${rows.length}`);
  console.log(`Preliminarily seedable rows: ${prelimSeedableRows.length}`);
  console.log(`Skipped rows before date handling: ${issues.length}`);

  await connectDatabase();

  const officePlans = await resolveOfficePlans(prelimSeedableRows);
  const categoryPlans = await resolveCategoryPlans(prelimSeedableRows);

  const finalSeedableRows: SeedableRow[] = [];
  for (const row of prelimSeedableRows) {
    const office = officePlans.get(normalizeKey(row.officeName));
    const category = categoryPlans.get(normalizeKey(row.categoryName));
    if (!office || !category) {
      continue;
    }
    const dateResult = parseDateCell(row);
    if (dateResult.issue) {
      malformedDateIssues.push(dateResult.issue);
    }
    finalSeedableRows.push({
      row,
      officeId: office.id,
      categoryId: category.id,
      assetKey: buildMasterKey(row, category.id),
      parsedDate: dateResult.value,
      rawDateIssue: dateResult.issue,
    });
  }

  printIssueOptions(quantityIssueRows, malformedDateIssues);

  const assetAggregates = await upsertAssets(finalSeedableRows);
  const createdItemsByRow = await seedItems(finalSeedableRows, assetAggregates);

  const createdItemCount = createdItemsByRow.reduce((sum, entry) => sum + entry.created, 0);
  const seededRowCount = createdItemsByRow.filter((entry) => entry.created > 0).length;

  const officeSummary = Array.from(officePlans.values()).sort((left, right) => left.name.localeCompare(right.name));
  const categorySummary = Array.from(categoryPlans.values()).sort((left, right) => left.name.localeCompare(right.name));

  console.log('\nSeed summary:');
  console.log(`- Offices resolved or created: ${officeSummary.length}`);
  console.log(`- Categories resolved or created: ${categorySummary.length}`);
  console.log(`- Asset masters upserted: ${assetAggregates.size}`);
  console.log(`- Source rows seeded into items: ${seededRowCount}`);
  console.log(`- Asset items inserted this run: ${createdItemCount}`);
  console.log(`- Rows skipped due to hard data issues: ${issues.length}`);
  console.log(`- Rows seeded with null dates because of malformed source dates: ${malformedDateIssues.length}`);

  console.log('\nOffice mapping:');
  for (const office of officeSummary) {
    console.log(`- ${office.name} -> ${office.type} (${office.id})`);
  }

  console.log('\nCategory mapping:');
  for (const category of categorySummary) {
    console.log(`- ${category.name} -> ${category.id}`);
  }

  if (issues.length > 0) {
    console.log('\nSkipped rows:');
    for (const issue of issues) {
      console.log(
        `- ${issue.file} row ${issue.row} | ${issue.asset || 'Unknown asset'} | ${issue.office ?? 'Unknown office'} | ${issue.kind} | ${issue.detail}`
      );
    }
  }
}

run()
  .catch((error) => {
    console.error('Asset workbook seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
