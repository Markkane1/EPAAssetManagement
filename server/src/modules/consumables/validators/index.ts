import { z } from 'zod';
import { SUPPORTED_UOMS } from '../utils/unitConversion';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const uomEnum = z.enum(SUPPORTED_UOMS);
const boolOptional = z.boolean().optional();

export const consumableItemCreateSchema = z.object({
  name: z.string().min(1).max(120),
  casNumber: z.string().max(64).optional(),
  categoryId: objectId.optional(),
  baseUom: uomEnum,
  isHazardous: boolOptional,
  isControlled: boolOptional,
  isChemical: boolOptional,
  requiresLotTracking: boolOptional,
  requiresContainerTracking: boolOptional,
  defaultMinStock: z.coerce.number().min(0).optional(),
  defaultReorderPoint: z.coerce.number().min(0).optional(),
  storageCondition: z.string().max(200).optional(),
});

export const consumableItemUpdateSchema = consumableItemCreateSchema.partial();

export const consumableSupplierCreateSchema = z.object({
  name: z.string().min(1).max(120),
  contactName: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  address: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const consumableSupplierUpdateSchema = consumableSupplierCreateSchema.partial();

const lotDocsSchema = z.object({
  sdsUrl: z.string().url().optional(),
  coaUrl: z.string().url().optional(),
  invoiceUrl: z.string().url().optional(),
}).partial();

export const consumableLotCreateSchema = z.object({
  itemId: objectId,
  supplierId: objectId.optional(),
  lotNumber: z.string().min(1).max(120),
  receivedDate: z.string().min(1),
  expiryDate: z.string().optional(),
  docs: lotDocsSchema.optional(),
});

export const consumableLotUpdateSchema = consumableLotCreateSchema.partial();

export const consumableContainerCreateSchema = z.object({
  lotId: objectId,
  containerCode: z.string().min(1).max(120),
  initialQtyBase: z.coerce.number().min(0),
  currentQtyBase: z.coerce.number().min(0).optional(),
  currentLocationId: objectId,
  status: z.enum(['IN_STOCK', 'EMPTY', 'DISPOSED', 'LOST']).optional(),
  openedDate: z.string().optional(),
});

export const consumableContainerUpdateSchema = consumableContainerCreateSchema.partial();

export const consumableLocationCreateSchema = z.object({
  name: z.string().min(1).max(120),
  division: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  address: z.string().max(200).optional(),
  contactNumber: z.string().max(64).optional(),
  type: z.enum(['CENTRAL', 'LAB', 'SUBSTORE']).optional(),
  parentLocationId: objectId.optional(),
  labCode: z.string().max(64).optional(),
  isActive: z.boolean().optional(),
  capabilities: z.object({
    moveables: z.boolean().optional(),
    consumables: z.boolean().optional(),
    chemicals: z.boolean().optional(),
  }).optional(),
});

export const consumableLocationUpdateSchema = consumableLocationCreateSchema.partial();

export const receiveSchema = z.object({
  locationId: objectId,
  itemId: objectId,
  lotId: objectId.optional(),
  lot: z.object({
    lotNumber: z.string().min(1).max(120),
    receivedDate: z.string().min(1),
    expiryDate: z.string().optional(),
    supplierId: objectId.optional(),
    docs: lotDocsSchema.optional(),
  }).optional(),
  qty: z.coerce.number().positive(),
  uom: uomEnum,
  containers: z.array(z.object({
    containerCode: z.string().min(1).max(120),
    initialQty: z.coerce.number().positive(),
    openedDate: z.string().optional(),
  })).optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

export const transferSchema = z.object({
  fromLocationId: objectId,
  toLocationId: objectId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomEnum,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const consumeSchema = z.object({
  locationId: objectId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomEnum,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const adjustSchema = z.object({
  locationId: objectId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomEnum,
  direction: z.enum(['INCREASE', 'DECREASE']),
  reasonCodeId: objectId,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const disposeSchema = z.object({
  locationId: objectId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomEnum,
  reasonCodeId: objectId,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const returnSchema = z.object({
  fromLocationId: objectId,
  toLocationId: objectId.optional(),
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomEnum,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const openingBalanceSchema = z.object({
  entries: z.array(
    z.object({
      locationId: objectId,
      itemId: objectId,
      lotId: objectId.optional(),
      qty: z.coerce.number().positive(),
      uom: uomEnum,
      reference: z.string().max(120).optional(),
      notes: z.string().max(500).optional(),
      metadata: z.record(z.any()).optional(),
    })
  ).min(1),
});

export const balanceQuerySchema = z.object({
  locationId: objectId,
  itemId: objectId,
  lotId: objectId.optional(),
});

export const balancesQuerySchema = z.object({
  locationId: objectId.optional(),
  itemId: objectId.optional(),
  lotId: objectId.optional(),
});

export const rollupQuerySchema = z.object({
  itemId: objectId.optional(),
});

export const ledgerQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  locationId: objectId.optional(),
  itemId: objectId.optional(),
  lotId: objectId.optional(),
  txType: z.enum(['RECEIPT', 'TRANSFER', 'CONSUME', 'ADJUST', 'DISPOSE', 'RETURN', 'OPENING_BALANCE']).optional(),
});

export const expiryQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).optional(),
  locationId: objectId.optional(),
});

export const reasonCodeQuerySchema = z.object({
  category: z.enum(['ADJUST', 'DISPOSE']).optional(),
});

export const reasonCodeCreateSchema = z.object({
  category: z.enum(['ADJUST', 'DISPOSE']),
  code: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
});
