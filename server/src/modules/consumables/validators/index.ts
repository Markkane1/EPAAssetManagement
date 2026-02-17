import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const holderId = z.string().min(1).max(64);
const uomSchema = z.string().min(1).max(32);
const boolOptional = z.boolean().optional();
const unitGroupSchema = z.enum(['mass', 'volume', 'count']);
const holderTypeSchema = z.enum(['OFFICE', 'STORE', 'EMPLOYEE', 'SUB_LOCATION']);
const qty2dpSchema = z.coerce
  .number()
  .refine((value) => Number.isFinite(value), 'Quantity must be a valid number')
  .refine((value) => value > 0, 'Quantity must be greater than 0')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'Quantity must have at most 2 decimal places');

export const consumableItemCreateSchema = z.object({
  name: z.string().min(1).max(120),
  casNumber: z.string().max(64).optional(),
  categoryId: objectId.optional(),
  baseUom: uomSchema,
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

export const consumableUnitCreateSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  group: unitGroupSchema,
  toBase: z.coerce.number().positive(),
  aliases: z.array(z.string().min(1).max(64)).optional(),
  isActive: z.boolean().optional(),
});

export const consumableUnitUpdateSchema = consumableUnitCreateSchema.partial();

export const consumableUnitQuerySchema = z.object({
  active: z.string().optional(),
  group: unitGroupSchema.optional(),
});

const lotDocsSchema = z.object({
  sdsUrl: z.string().url().optional(),
  coaUrl: z.string().url().optional(),
  invoiceUrl: z.string().url().optional(),
}).partial();

export const consumableLotQuerySchema = z.object({
  holder_type: z.enum(['STORE', 'OFFICE', 'EMPLOYEE', 'SUB_LOCATION']).optional(),
  holder_id: holderId.optional(),
  consumable_id: objectId.optional(),
  include_zero: z.string().optional(),
  batch_no: z.string().max(120).optional(),
  limit: z.string().optional(),
  page: z.string().optional(),
});

export const consumableIssueCreateSchema = z.object({
  lot_id: objectId,
  to_type: z.enum(['OFFICE', 'USER']),
  to_id: objectId,
  quantity: qty2dpSchema,
  notes: z.string().max(500).optional(),
  document_id: objectId.optional(),
});

export const consumableConsumptionCreateSchema = z.object({
  source_type: z.enum(['OFFICE', 'USER']),
  source_id: objectId,
  consumable_id: objectId,
  quantity: qty2dpSchema,
  issue_id: objectId.optional(),
  notes: z.string().max(500).optional(),
  consumed_at: z.string().optional(),
});

export const consumableReturnCreateSchema = z
  .object({
    mode: z.enum(['USER_TO_OFFICE', 'OFFICE_TO_STORE_LOT']),
    consumable_id: objectId,
    quantity: qty2dpSchema,
    notes: z.string().max(500).optional(),
    from_user_id: objectId.optional(),
    to_office_id: objectId.optional(),
    from_office_id: objectId.optional(),
    to_lot_id: objectId.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'USER_TO_OFFICE') {
      if (!data.from_user_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['from_user_id'],
          message: 'from_user_id is required for USER_TO_OFFICE',
        });
      }
      if (!data.to_office_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to_office_id'],
          message: 'to_office_id is required for USER_TO_OFFICE',
        });
      }
    }
    if (data.mode === 'OFFICE_TO_STORE_LOT') {
      if (!data.from_office_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['from_office_id'],
          message: 'from_office_id is required for OFFICE_TO_STORE_LOT',
        });
      }
      if (!data.to_lot_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to_lot_id'],
          message: 'to_lot_id is required for OFFICE_TO_STORE_LOT',
        });
      }
    }
  });

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

export const receiveSchema = z.object({
  holderType: holderTypeSchema.optional(),
  holderId: holderId.optional(),
  categoryId: objectId,
  itemId: objectId,
  lotId: objectId.optional(),
  lot: z.object({
    lotNumber: z.string().min(1).max(120),
    receivedDate: z.string().min(1),
    expiryDate: z.string().optional(),
    source: z.enum(['procurement', 'project']),
    vendorId: objectId.optional(),
    projectId: objectId.optional(),
    schemeId: objectId.optional(),
    docs: lotDocsSchema.optional(),
  }).superRefine((lot, ctx) => {
    if (lot.source === 'procurement' && !lot.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vendorId'],
        message: 'vendorId is required for procurement source',
      });
    }
    if (lot.source === 'project') {
      if (!lot.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projectId'],
          message: 'projectId is required for project source',
        });
      }
      if (!lot.schemeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schemeId'],
          message: 'schemeId is required for project source',
        });
      }
    }
  }).optional(),
  qty: z.coerce.number().positive(),
  uom: uomSchema,
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
  fromHolderType: holderTypeSchema.optional(),
  fromHolderId: holderId,
  toHolderType: holderTypeSchema.optional(),
  toHolderId: holderId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomSchema,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const consumeSchema = z.object({
  holderType: holderTypeSchema.optional(),
  holderId: holderId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomSchema,
  reference: z.string().max(120).optional(),
  notes: z.string().min(1, 'notes is required').max(500),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const adjustSchema = z.object({
  holderType: holderTypeSchema.optional(),
  holderId: holderId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomSchema,
  direction: z.enum(['INCREASE', 'DECREASE']),
  reasonCodeId: objectId,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const disposeSchema = z.object({
  holderType: holderTypeSchema.optional(),
  holderId: holderId,
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomSchema,
  reasonCodeId: objectId,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const returnSchema = z.object({
  fromHolderType: holderTypeSchema.optional(),
  fromHolderId: holderId,
  toHolderType: holderTypeSchema.optional(),
  toHolderId: holderId.optional(),
  itemId: objectId,
  lotId: objectId.optional(),
  containerId: objectId.optional(),
  qty: z.coerce.number().positive(),
  uom: uomSchema,
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
  allowNegative: z.boolean().optional(),
  overrideNote: z.string().max(500).optional(),
});

export const openingBalanceSchema = z.object({
  entries: z.array(
    z.object({
      holderType: holderTypeSchema.optional(),
      holderId: holderId,
      itemId: objectId,
      lotId: objectId.optional(),
      qty: z.coerce.number().positive(),
      uom: uomSchema,
      reference: z.string().max(120).optional(),
      notes: z.string().max(500).optional(),
      metadata: z.record(z.any()).optional(),
    })
  ).min(1),
});

export const balanceQuerySchema = z.object({
  holderType: holderTypeSchema.optional(),
  holderId: holderId,
  itemId: objectId,
  lotId: objectId.optional(),
});

export const balancesQuerySchema = z.object({
  holderType: holderTypeSchema.optional(),
  holderId: holderId.optional(),
  itemId: objectId.optional(),
  lotId: objectId.optional(),
});

export const rollupQuerySchema = z.object({
  holderType: holderTypeSchema.optional(),
  holderId: holderId.optional(),
  itemId: objectId.optional(),
});

export const ledgerQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  holderType: holderTypeSchema.optional(),
  holderId: holderId.optional(),
  itemId: objectId.optional(),
  lotId: objectId.optional(),
  txType: z.enum(['RECEIPT', 'TRANSFER', 'CONSUME', 'ADJUST', 'DISPOSE', 'RETURN', 'OPENING_BALANCE']).optional(),
});

export const expiryQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).optional(),
  holderType: holderTypeSchema.optional(),
  holderId: holderId.optional(),
});

export const reasonCodeQuerySchema = z.object({
  category: z.enum(['ADJUST', 'DISPOSE']).optional(),
});

export const reasonCodeCreateSchema = z.object({
  category: z.enum(['ADJUST', 'DISPOSE']),
  code: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
});
