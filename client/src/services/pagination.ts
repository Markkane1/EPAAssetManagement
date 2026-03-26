export interface ListQuery {
  page?: number;
  limit?: number;
  meta?: boolean;
  details?: boolean;
}

export interface PagedListResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export function toListQueryString(query: ListQuery = {}) {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.meta) params.set('meta', '1');
  if (query.details) params.set('details', '1');
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}
