import api from '@/lib/api';
import {
  ConsumableInventoryBalance,
  ConsumableInventoryTransaction,
  ConsumableRollupRow,
  ConsumableExpiryRow,
} from '@/types';

export interface ReceivePayload {
  locationId: string;
  itemId: string;
  lotId?: string;
  lot?: {
    lotNumber: string;
    receivedDate: string;
    expiryDate?: string;
    supplierId?: string;
    docs?: { sdsUrl?: string; coaUrl?: string; invoiceUrl?: string };
  };
  qty: number;
  uom: string;
  containers?: { containerCode: string; initialQty: number; openedDate?: string }[];
  reference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferPayload {
  fromLocationId: string;
  toLocationId: string;
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
  locationId: string;
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
  locationId: string;
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
  locationId: string;
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
  fromLocationId: string;
  toLocationId?: string;
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
    locationId: string;
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
  locationId: string;
  itemId: string;
  lotId?: string;
}

export interface BalancesQuery {
  locationId?: string;
  itemId?: string;
  lotId?: string;
}

export interface LedgerQuery {
  from?: string;
  to?: string;
  locationId?: string;
  itemId?: string;
  lotId?: string;
  txType?: string;
}

export const consumableInventoryService = {
  receive: (payload: ReceivePayload) =>
    api.post<ConsumableInventoryTransaction>('/consumables/inventory/receive', payload),
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
  getBalance: (query: BalanceQuery) =>
    api.get<ConsumableInventoryBalance | null>(
      `/consumables/inventory/balance?locationId=${query.locationId}&itemId=${query.itemId}${
        query.lotId ? `&lotId=${query.lotId}` : ''
      }`
    ),
  getBalances: (query?: BalancesQuery) => {
    const params = new URLSearchParams();
    if (query?.locationId) params.set('locationId', query.locationId);
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
    if (query?.locationId) params.set('locationId', query.locationId);
    if (query?.itemId) params.set('itemId', query.itemId);
    if (query?.lotId) params.set('lotId', query.lotId);
    if (query?.txType) params.set('txType', query.txType);
    const search = params.toString();
    return api.get<ConsumableInventoryTransaction[]>(`/consumables/ledger${search ? `?${search}` : ''}`);
  },
  getExpiry: (days?: number, locationId?: string) => {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (locationId) params.set('locationId', locationId);
    const search = params.toString();
    return api.get<ConsumableExpiryRow[]>(`/consumables/expiry${search ? `?${search}` : ''}`);
  },
};

export default consumableInventoryService;
