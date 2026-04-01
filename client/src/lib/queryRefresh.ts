import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { PagedListResponse } from '@/services/pagination';

export async function refreshActiveQueries(
  queryClient: QueryClient,
  queryKeys: QueryKey[]
) {
  const seen = new Set<string>();
  const uniqueKeys = queryKeys.filter((queryKey) => {
    const signature = JSON.stringify(queryKey);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });

  await Promise.all(
    uniqueKeys.map(async (queryKey) => {
      if (typeof queryClient.invalidateQueries === 'function') {
        await queryClient.invalidateQueries({ queryKey });
      }
      if (typeof queryClient.refetchQueries === 'function') {
        await queryClient.refetchQueries({ queryKey, type: 'active' });
      }
    })
  );
}

type Identifiable = {
  id?: string | number | null;
  _id?: string | number | null;
};

type SyncEntityOptions<T extends Identifiable> = {
  queryKey: QueryKey;
  entity: T;
  matchesQuery?: (queryKey: QueryKey, entity: T) => boolean;
  getPageInfo?: (queryKey: QueryKey) => { page: number; limit?: number | null } | null;
  sortItems?: (items: T[]) => T[];
};

function getEntityId(value: Identifiable) {
  const candidate = value.id ?? value._id;
  return candidate === undefined || candidate === null ? '' : String(candidate);
}

function isPagedListResponse<T>(value: unknown): value is PagedListResponse<T> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as PagedListResponse<T>).items) &&
      typeof (value as PagedListResponse<T>).total === 'number'
  );
}

function upsertItems<T extends Identifiable>(items: T[], entity: T, sortItems?: (items: T[]) => T[]) {
  const entityId = getEntityId(entity);
  const existingIndex = items.findIndex((item) => getEntityId(item) === entityId);
  const nextItems = existingIndex >= 0
    ? items.map((item, index) => (index === existingIndex ? entity : item))
    : [entity, ...items];
  return sortItems ? sortItems(nextItems) : nextItems;
}

export function syncEntityInQueryCaches<T extends Identifiable>(
  queryClient: QueryClient,
  options: SyncEntityOptions<T>
) {
  const { queryKey, entity, matchesQuery, getPageInfo, sortItems } = options;
  const entityId = getEntityId(entity);
  if (!entityId) return;
  if (typeof queryClient.getQueryCache !== 'function') return;

  const queries = queryClient.getQueryCache().findAll({ queryKey });
  for (const query of queries) {
    const currentQueryKey = query.queryKey;
    const shouldInclude = matchesQuery ? matchesQuery(currentQueryKey, entity) : true;
    queryClient.setQueryData(currentQueryKey, (existing: unknown) => {
      if (Array.isArray(existing)) {
        const nextItems = shouldInclude
          ? upsertItems(existing as T[], entity, sortItems)
          : (existing as T[]).filter((item) => getEntityId(item) !== entityId);
        return nextItems;
      }

      if (isPagedListResponse<T>(existing)) {
        const pageInfo = getPageInfo?.(currentQueryKey);
        const page = pageInfo?.page ?? Number((existing as PagedListResponse<T>).page || 1);
        const limit = pageInfo?.limit ?? (existing as PagedListResponse<T>).limit ?? null;
        const hasExisting = existing.items.some((item) => getEntityId(item) === entityId);
        let nextItems = existing.items;

        if (shouldInclude) {
          if (hasExisting || page === 1) {
            nextItems = upsertItems(existing.items, entity, sortItems);
            if (!hasExisting && typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
              nextItems = nextItems.slice(0, limit);
            }
          }
        } else if (hasExisting) {
          nextItems = existing.items.filter((item) => getEntityId(item) !== entityId);
        }

        const nextTotal = shouldInclude
          ? hasExisting
            ? existing.total
            : existing.total + 1
          : hasExisting
            ? Math.max(0, existing.total - 1)
            : existing.total;

        return {
          ...existing,
          items: nextItems,
          total: nextTotal,
          hasMore: typeof limit === 'number' && Number.isFinite(limit)
            ? nextTotal > page * limit
            : existing.hasMore,
        } satisfies PagedListResponse<T>;
      }

      return existing;
    });
  }
}

export function removeEntityFromQueryCaches(
  queryClient: QueryClient,
  queryKey: QueryKey,
  entityId: string
) {
  if (!entityId) return;
  if (typeof queryClient.getQueryCache !== 'function') return;

  const queries = queryClient.getQueryCache().findAll({ queryKey });
  for (const query of queries) {
    const currentQueryKey = query.queryKey;
    queryClient.setQueryData(currentQueryKey, (existing: unknown) => {
      if (Array.isArray(existing)) {
        return existing.filter((item) => getEntityId(item as Identifiable) !== entityId);
      }

      if (isPagedListResponse<Identifiable>(existing)) {
        const hasExisting = existing.items.some((item) => getEntityId(item) === entityId);
        if (!hasExisting) return existing;
        return {
          ...existing,
          items: existing.items.filter((item) => getEntityId(item) !== entityId),
          total: Math.max(0, existing.total - 1),
        } satisfies PagedListResponse<Identifiable>;
      }

      return existing;
    });
  }
}
