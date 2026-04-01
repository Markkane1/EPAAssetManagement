import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

const HTTP_DURATION_BUCKETS_MS = [25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];
const DB_DURATION_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000];

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'status_class'],
  registers: [register],
});

const httpRequestErrorsTotal = new Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP requests with 4xx or 5xx status',
  labelNames: ['method', 'route', 'status_code', 'status_class'],
  registers: [register],
});

const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code', 'status_class'],
  buckets: HTTP_DURATION_BUCKETS_MS,
  registers: [register],
});

const dbQueriesTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'collection', 'status'],
  registers: [register],
});

const dbQueryDurationMs = new Histogram({
  name: 'db_query_duration_ms',
  help: 'Database query duration in milliseconds',
  labelNames: ['operation', 'collection', 'status'],
  buckets: DB_DURATION_BUCKETS_MS,
  registers: [register],
});

const cachePolicyAppliedTotal = new Counter({
  name: 'cache_policy_applied_total',
  help: 'Total number of times a cache policy was applied to a GET/HEAD response',
  labelNames: ['policy'],
  registers: [register],
});

const cacheValidationTotal = new Counter({
  name: 'cache_validation_total',
  help: 'Cache revalidation results for conditional GET requests',
  labelNames: ['policy', 'result'],
  registers: [register],
});

function statusClass(statusCode: number) {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  if (statusCode >= 200) return '2xx';
  return '1xx';
}

export function recordHttpRequestMetric(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number
) {
  const labels = {
    method: method.toUpperCase(),
    route,
    status_code: String(statusCode),
    status_class: statusClass(statusCode),
  };
  httpRequestsTotal.inc(labels, 1);
  if (statusCode >= 400) {
    httpRequestErrorsTotal.inc(labels, 1);
  }
  httpRequestDurationMs.observe(labels, durationMs);
}

export function recordDbQueryMetric(
  operation: string,
  collection: string,
  status: 'ok' | 'error',
  durationMs: number
) {
  const labels = {
    operation: operation.toLowerCase(),
    collection: collection.toLowerCase(),
    status,
  };
  dbQueriesTotal.inc(labels, 1);
  dbQueryDurationMs.observe(labels, durationMs);
}

export function recordCachePolicyMetric(policy: string) {
  cachePolicyAppliedTotal.inc({ policy }, 1);
}

export function recordCacheValidationMetric(policy: string, result: 'hit' | 'miss' | 'skip') {
  cacheValidationTotal.inc({ policy, result }, 1);
}

export async function getMetricsSnapshot() {
  const metrics = await register.getMetricsAsJSON();
  return {
    generated_at: new Date().toISOString(),
    metrics,
  };
}

export async function renderPrometheusMetrics() {
  return register.metrics();
}
