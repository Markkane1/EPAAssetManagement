type LabelValue = string | number | boolean;
type Labels = Record<string, LabelValue>;

type CounterSeries = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

type HistogramSeries = {
  name: string;
  labels: Record<string, string>;
  buckets: number[];
  bucketCounts: number[];
  sum: number;
  count: number;
};

const counterSeries = new Map<string, CounterSeries>();
const histogramSeries = new Map<string, HistogramSeries>();

const HTTP_DURATION_BUCKETS_MS = [25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];
const DB_DURATION_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000];

function normalizeLabelValue(value: LabelValue) {
  return String(value).trim().slice(0, 120) || 'unknown';
}

function sanitizeLabels(labels: Labels) {
  const normalized: Record<string, string> = {};
  Object.keys(labels)
    .sort()
    .forEach((key) => {
      normalized[key] = normalizeLabelValue(labels[key]);
    });
  return normalized;
}

function buildSeriesKey(name: string, labels: Record<string, string>) {
  return `${name}|${JSON.stringify(labels)}`;
}

function incrementCounter(name: string, labels: Labels, incrementBy = 1) {
  const normalizedLabels = sanitizeLabels(labels);
  const key = buildSeriesKey(name, normalizedLabels);
  const existing = counterSeries.get(key);
  if (existing) {
    existing.value += incrementBy;
    return;
  }
  counterSeries.set(key, {
    name,
    labels: normalizedLabels,
    value: incrementBy,
  });
}

function observeHistogram(name: string, labels: Labels, value: number, buckets: number[]) {
  const normalizedLabels = sanitizeLabels(labels);
  const key = buildSeriesKey(name, normalizedLabels);
  const existing = histogramSeries.get(key);
  const series =
    existing ||
    ({
      name,
      labels: normalizedLabels,
      buckets: [...buckets].sort((a, b) => a - b),
      bucketCounts: new Array(buckets.length).fill(0),
      sum: 0,
      count: 0,
    } as HistogramSeries);

  const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
  series.count += 1;
  series.sum += safeValue;
  series.buckets.forEach((bucket, index) => {
    if (safeValue <= bucket) {
      series.bucketCounts[index] += 1;
    }
  });

  if (!existing) {
    histogramSeries.set(key, series);
  }
}

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
    status_code: statusCode,
    status_class: statusClass(statusCode),
  };
  incrementCounter('http_requests_total', labels, 1);
  if (statusCode >= 400) {
    incrementCounter('http_request_errors_total', labels, 1);
  }
  observeHistogram('http_request_duration_ms', labels, durationMs, HTTP_DURATION_BUCKETS_MS);
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
  incrementCounter('db_queries_total', labels, 1);
  observeHistogram('db_query_duration_ms', labels, durationMs, DB_DURATION_BUCKETS_MS);
}

export function recordCachePolicyMetric(policy: string) {
  incrementCounter('cache_policy_applied_total', { policy }, 1);
}

export function recordCacheValidationMetric(policy: string, result: 'hit' | 'miss' | 'skip') {
  incrementCounter('cache_validation_total', { policy, result }, 1);
}

export function getMetricsSnapshot() {
  return {
    generated_at: new Date().toISOString(),
    counters: Array.from(counterSeries.values()).sort((a, b) => a.name.localeCompare(b.name)),
    histograms: Array.from(histogramSeries.values()).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function serializeLabels(labels: Record<string, string>) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const encoded = entries.map(([key, value]) => `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${encoded.join(',')}}`;
}

export function renderPrometheusMetrics() {
  const lines: string[] = [];

  const counters = Array.from(counterSeries.values()).sort((a, b) =>
    `${a.name}${JSON.stringify(a.labels)}`.localeCompare(`${b.name}${JSON.stringify(b.labels)}`)
  );
  let currentCounterName = '';
  for (const series of counters) {
    if (series.name !== currentCounterName) {
      currentCounterName = series.name;
      lines.push(`# TYPE ${series.name} counter`);
    }
    lines.push(`${series.name}${serializeLabels(series.labels)} ${series.value}`);
  }

  const histograms = Array.from(histogramSeries.values()).sort((a, b) =>
    `${a.name}${JSON.stringify(a.labels)}`.localeCompare(`${b.name}${JSON.stringify(b.labels)}`)
  );
  let currentHistogramName = '';
  for (const series of histograms) {
    if (series.name !== currentHistogramName) {
      currentHistogramName = series.name;
      lines.push(`# TYPE ${series.name} histogram`);
    }

    series.buckets.forEach((bucket, index) => {
      const bucketLabels = { ...series.labels, le: String(bucket) };
      lines.push(`${series.name}_bucket${serializeLabels(bucketLabels)} ${series.bucketCounts[index]}`);
    });
    const infLabels = { ...series.labels, le: '+Inf' };
    lines.push(`${series.name}_bucket${serializeLabels(infLabels)} ${series.count}`);
    lines.push(`${series.name}_sum${serializeLabels(series.labels)} ${series.sum}`);
    lines.push(`${series.name}_count${serializeLabels(series.labels)} ${series.count}`);
  }

  if (lines.length === 0) {
    return '# no metrics recorded yet\n';
  }
  return `${lines.join('\n')}\n`;
}

