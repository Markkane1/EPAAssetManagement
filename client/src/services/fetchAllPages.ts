import type { PagedListResponse } from "@/services/pagination";

interface QueryWithPagination {
  page?: number;
  limit?: number;
}

interface FetchAllPagesOptions {
  pageSize?: number;
  maxPages?: number;
}

export async function fetchAllPages<T, TQuery extends QueryWithPagination>(
  query: TQuery,
  fetchPage: (query: TQuery) => Promise<PagedListResponse<T>>,
  options: FetchAllPagesOptions = {}
) {
  const pageSize = Math.max(1, options.pageSize || 200);
  const maxPages = Math.max(1, options.maxPages || 1000);
  const items: T[] = [];
  let page = 1;

  while (page <= maxPages) {
    const response = await fetchPage({
      ...query,
      page,
      limit: pageSize,
    });

    const pageItems = Array.isArray(response?.items) ? response.items : [];
    items.push(...pageItems);

    if (!response?.hasMore || pageItems.length === 0 || items.length >= Number(response?.total || 0)) {
      break;
    }

    page += 1;
  }

  return items;
}
