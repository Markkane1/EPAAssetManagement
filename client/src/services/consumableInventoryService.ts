import api from '@/lib/api';
import {
  ConsumableInventoryBalance,
  ConsumableInventoryTransaction,
  ConsumableRollupRow,
  ConsumableExpiryRow,
} from '@/types';

export type InventoryHolderType = 'OFFICE' | 'STORE' | 'EMPLOYEE' | 'SUB_LOCATION';

export interface ReceivePayload {
  holderType?: InventoryHolderType;
  holderId?: string;
  categoryId: string;
  itemId: string;
  lotId?: string;
  lot?: {
    lotNumber: string;
    receivedDate: string;
    expiryDate?: string;
    source: 'procurement' | 'project';
    vendorId?: string;
    projectId?: string;
    schemeId?: string;
    docs?: { sdsUrl?: string; coaUrl?: string; invoiceUrl?: string };
  };
  handoverDocumentationFile?: File | null;
  qty: number;
  uom: string;
  containers?: { containerCode: string; initialQty: number; openedDate?: string }[];
  reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferPayload {
  fromHolderType?: InventoryHolderType;
  fromHolderId: string;
  toHolderType?: InventoryHolderType;
  toHolderId: string;
  itemId: string;
  lotId?: string;
  containerId?: string;
  qty: number;
  uom: string;
  reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  allowNegative?: boolean;
  overrideNote?: string;
}

export interface ConsumePayload {
  holderType?: InventoryHolderType;
  holderId: string;
  itemId: string;
  lotId?: string;
  containerId?: string;
  qty: number;
  uom: string;
  reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  allowNegative?: boolean;
  overrideNote?: string;
}

export interface AdjustPayload {
  holderType?: InventoryHolderType;
  holderId: string;
  itemId: string;
  lotId?: string;
  containerId?: string;
  qty: number;
  uom: string;
  direction: 'INCREASE' | 'DECREASE';
  reasonCodeId: string;
  reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  allowNegative?: boolean;
  overrideNote?: string;
}

export interface DisposePayload {
  holderType?: InventoryHolderType;
  holderId: string;
  itemId: string;
  lotId?: string;
  containerId?: string;
  qty: number;
  uom: string;
  reasonCodeId: string;
  reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  allowNegative?: boolean;
  overrideNote?: string;
}

export interface ReturnPayload {
  fromHolderType?: InventoryHolderType;
  fromHolderId: string;
  toHolderType?: InventoryHolderType;
  toHolderId?: string;
  itemId: string;
  lotId?: string;
  containerId?: string;
  qty: number;
  uom: string;
  reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  allowNegative?: boolean;
  overrideNote?: string;
}

export interface OpeningBalancePayload {
  entries: Array<{
    holderType?: InventoryHolderType;
    holderId: string;
    itemId: string;
    lotId?: string;
    qty: number;
    uom: string;
    reference?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface BalanceQuery {
  holderType?: InventoryHolderType;
  holderId: string;
  itemId: string;
  lotId?: string;
}

export interface BalancesQuery {
  holderType?: InventoryHolderType;
  holderId?: string;
  itemId?: string;
  lotId?: string;
}

export interface LedgerQuery {
  from?: string;
  to?: string;
  holderType?: InventoryHolderType;
  holderId?: string;
  itemId?: string;
  lotId?: string;
  txType?: string;
}

function sanitizeReceivePayload(payload: ReceivePayload) {
  const {
    handoverDocumentationFile,
    ...rest
  } = payload;
  return {
    payload: rest,
    handoverDocumentationFile,
  };
}

function toReceiveFormData(payload: ReceivePayload) {
  const { payload: jsonPayload, handoverDocumentationFile } = sanitizeReceivePayload(payload);
  const formData = new FormData();
  formData.append('payload', JSON.stringify(jsonPayload));
  if (handoverDocumentationFile) {
    formData.append('handoverDocumentation', handoverDocumentationFile);
  }
  return formData;
}

export const consumableInventoryService = {
  receive: (payload: ReceivePayload) =>
    api.upload<ConsumableInventoryTransaction>('/consumables/inventory/receive', toReceiveFormData(payload)),
  transfer: (payload: TransferPayload) =>
    api.post<ConsumableInventoryTransaction | ConsumableInventoryTransaction[]>(
      '/consumables/inventory/transfer',
      payload
    ),
  consume: (payload: ConsumePayload) =>
    api.post<ConsumableInventoryTransaction | ConsumableInventoryTransaction[]>(
      '/consumables/inventory/consume',
      payload
    ),
  adjust: (payload: AdjustPayload) =>
    api.post<ConsumableInventoryTransaction>('/consumables/inventory/adjust', payload),
  dispose: (payload: DisposePayload) =>
    api.post<ConsumableInventoryTransaction>('/consumables/inventory/dispose', payload),
  returnToCentral: (payload: ReturnPayload) =>
    api.post<ConsumableInventoryTransaction | ConsumableInventoryTransaction[]>(
      '/consumables/inventory/return',
      payload
    ),
  openingBalance: (payload: OpeningBalancePayload) =>
    api.post<ConsumableInventoryTransaction[]>('/consumables/inventory/opening-balance', payload),
  getBalance: (query: BalanceQuery) => {
    const params = new URLSearchParams();
    if (query.holderType) params.set('holderType', query.holderType);
    if (query.holderId) params.set('holderId', query.holderId);
    params.set('itemId', query.itemId);
    if (query.lotId) params.set('lotId', query.lotId);
    return api.get<ConsumableInventoryBalance | null>(`/consumables/inventory/balance?${params.toString()}`);
  },
  getBalances: (query?: BalancesQuery) => {
    const params = new URLSearchParams();
    if (query?.holderType) params.set('holderType', query.holderType);
    if (query?.holderId) params.set('holderId', query.holderId);
    if (query?.itemId) params.set('itemId', query.itemId);
    if (query?.lotId) params.set('lotId', query.lotId);
    const search = params.toString();
    return api.get<ConsumableInventoryBalance[]>(`/consumables/inventory/balances${search ? `?${search}` : ''}`);
  },
  getRollup: (itemId?: string) =>
    api.get<ConsumableRollupRow[]>(`/consumables/inventory/rollup${itemId ? `?itemId=${itemId}` : ''}`),
  getLedger: (query?: LedgerQuery) => {
    const params = new URLSearchParams();
    if (query?.from) params.set('from', query.from);
    if (query?.to) params.set('to', query.to);
    if (query?.holderType) params.set('holderType', query.holderType);
    if (query?.holderId) params.set('holderId', query.holderId);
    if (query?.itemId) params.set('itemId', query.itemId);
    if (query?.lotId) params.set('lotId', query.lotId);
    if (query?.txType) params.set('txType', query.txType);
    const search = params.toString();
    return api.get<ConsumableInventoryTransaction[]>(`/consumables/ledger${search ? `?${search}` : ''}`);
  },
  getExpiry: (days?: number, holderType?: InventoryHolderType, holderId?: string) => {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (holderType) params.set('holderType', holderType);
    if (holderId) params.set('holderId', holderId);
    const search = params.toString();
    return api.get<ConsumableExpiryRow[]>(`/consumables/expiry${search ? `?${search}` : ''}`);
  },
};

export default consumableInventoryService;
