import { useQuery } from '@tanstack/react-query';
import { reportService } from '@/services/reportService';
import type {
  InventorySnapshotParams,
  MoveableAssignedParams,
  ConsumableAssignedParams,
  ConsumableConsumedParams,
  AgingReportParams,
  AnalyticsTrendsParams,
  RequisitionReportParams,
} from '@/services/reportService';

export function useInventorySnapshot(params?: InventorySnapshotParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'inventory-snapshot', params],
    queryFn: () => reportService.getInventorySnapshot(params),
    enabled,
  });
}

export function useMoveableAssigned(params?: MoveableAssignedParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'moveable-assigned', params],
    queryFn: () => reportService.getMoveableAssigned(params),
    enabled,
  });
}

export function useConsumableAssigned(params?: ConsumableAssignedParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'consumable-assigned', params],
    queryFn: () => reportService.getConsumableAssigned(params),
    enabled,
  });
}

export function useConsumableConsumed(params?: ConsumableConsumedParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'consumable-consumed', params],
    queryFn: () => reportService.getConsumableConsumed(params),
    enabled,
  });
}

export function useMoveableLifecycle(assetItemId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'moveable-lifecycle', assetItemId],
    queryFn: () => reportService.getMoveableLifecycle(assetItemId!),
    enabled: enabled && Boolean(assetItemId),
  });
}

export function useLotLifecycle(lotId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'lot-lifecycle', lotId],
    queryFn: () => reportService.getLotLifecycle(lotId!),
    enabled: enabled && Boolean(lotId),
  });
}

export function useAssignmentTrace(assignmentId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'assignment-trace', assignmentId],
    queryFn: () => reportService.getAssignmentTrace(assignmentId!),
    enabled: enabled && Boolean(assignmentId),
  });
}

export function useRequisitionAging(params?: AgingReportParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'requisition-aging', params],
    queryFn: () => reportService.getRequisitionAging(params),
    enabled,
  });
}

export function useReturnAging(params?: AgingReportParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'return-aging', params],
    queryFn: () => reportService.getReturnAging(params),
    enabled,
  });
}

export function useRequisitionsReport(params?: RequisitionReportParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'requisitions', params],
    queryFn: () => reportService.getRequisitions(params),
    enabled,
  });
}

export function useAnalyticsTrends(params: AnalyticsTrendsParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'analytics-trends', params],
    queryFn: () => reportService.getAnalyticsTrends(params),
    enabled,
  });
}
