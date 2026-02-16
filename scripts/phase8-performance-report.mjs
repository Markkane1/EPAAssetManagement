import fs from 'node:fs/promises';
import path from 'node:path';
import {
  extractJsonBlock,
  getMonthKey,
  runCommand,
  safeParseJson,
  writeJson,
  writeText,
} from './phase8-utils.mjs';

const SCENARIOS = [
  { name: 'load', warmup: 3, iterations: 20, concurrency: 4 },
  { name: 'spike', warmup: 2, iterations: 15, concurrency: 12 },
  { name: 'soak', warmup: 2, iterations: 50, concurrency: 4 },
];

function summarizeScenario(run) {
  const endpoints = Array.isArray(run.endpoints) ? run.endpoints : [];
  if (endpoints.length === 0) {
    return {
      endpointCount: 0,
      avgP95Ms: 0,
      avgP99Ms: 0,
      avgThroughputRps: 0,
    };
  }
  const totals = endpoints.reduce(
    (acc, endpoint) => {
      acc.p95 += Number(endpoint.p95Ms || 0);
      acc.p99 += Number(endpoint.p99Ms || 0);
      acc.throughput += Number(endpoint.throughputRps || 0);
      return acc;
    },
    { p95: 0, p99: 0, throughput: 0 }
  );
  const count = endpoints.length;
  return {
    endpointCount: count,
    avgP95Ms: Number((totals.p95 / count).toFixed(2)),
    avgP99Ms: Number((totals.p99 / count).toFixed(2)),
    avgThroughputRps: Number((totals.throughput / count).toFixed(2)),
  };
}

async function readPreviousPerformance(root, currentMonthKey) {
  const phase8Dir = path.join(root, 'artifacts', 'phase8');
  try {
    const entries = await fs.readdir(phase8Dir, { withFileTypes: true });
    const months = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^\d{4}-\d{2}$/.test(name))
      .filter((name) => name < currentMonthKey)
      .sort();
    if (months.length === 0) return null;
    const previousMonth = months[months.length - 1];
    const previousPath = path.join(phase8Dir, previousMonth, 'performance-scenarios.json');
    const content = await fs.readFile(previousPath, 'utf8');
    return safeParseJson(content);
  } catch {
    return null;
  }
}

function buildTrend(current, previous) {
  if (!previous || !Array.isArray(previous.runs)) {
    return { baseline: true, deltas: [] };
  }

  const previousMap = new Map();
  for (const run of previous.runs) {
    for (const endpoint of run.endpoints || []) {
      previousMap.set(`${run.scenario}:${endpoint.endpoint}`, endpoint);
    }
  }

  const deltas = [];
  for (const run of current.runs) {
    for (const endpoint of run.endpoints || []) {
      const key = `${run.scenario}:${endpoint.endpoint}`;
      const old = previousMap.get(key);
      if (!old) continue;
      deltas.push({
        scenario: run.scenario,
        endpoint: endpoint.endpoint,
        p95DeltaMs: Number((Number(endpoint.p95Ms || 0) - Number(old.p95Ms || 0)).toFixed(2)),
        p99DeltaMs: Number((Number(endpoint.p99Ms || 0) - Number(old.p99Ms || 0)).toFixed(2)),
        throughputDeltaRps: Number((Number(endpoint.throughputRps || 0) - Number(old.throughputRps || 0)).toFixed(2)),
      });
    }
  }

  return { baseline: false, deltas };
}

async function runScenario(config) {
  const args = [
    '-w',
    'server',
    'tsx',
    'tests/performance/remaining-read-benchmark.ts',
    '--scenario',
    config.name,
    '--warmup',
    String(config.warmup),
    '--iterations',
    String(config.iterations),
    '--concurrency',
    String(config.concurrency),
  ];
  const result = await runCommand('npx', args, { passthrough: true });
  if (result.code !== 0) {
    throw new Error(`Scenario ${config.name} failed with exit code ${result.code}`);
  }

  const jsonBlock = extractJsonBlock(result.stdout);
  const parsed = safeParseJson(jsonBlock || '');
  if (!parsed || !Array.isArray(parsed.endpoints)) {
    throw new Error(`Scenario ${config.name} did not produce valid benchmark JSON output`);
  }
  return {
    scenario: config.name,
    warmup: config.warmup,
    iterations: config.iterations,
    concurrency: config.concurrency,
    generatedAt: parsed.generatedAt || new Date().toISOString(),
    endpoints: parsed.endpoints,
    summary: summarizeScenario(parsed),
  };
}

async function main() {
  const root = process.cwd();
  const monthKey = getMonthKey();
  const artifactsDir = path.join(root, 'artifacts', 'phase8', monthKey);

  const runs = [];
  for (const scenario of SCENARIOS) {
    const run = await runScenario(scenario);
    runs.push(run);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    monthKey,
    runs,
  };

  const previous = await readPreviousPerformance(root, monthKey);
  const trend = buildTrend(report, previous);

  const reportJsonPath = path.join(artifactsDir, 'performance-scenarios.json');
  await writeJson(reportJsonPath, report);

  const trendJsonPath = path.join(artifactsDir, 'performance-trend.json');
  await writeJson(trendJsonPath, trend);

  const lines = [
    '# Phase 8 Performance Trend',
    '',
    `- Generated At: ${report.generatedAt}`,
    `- Month: ${monthKey}`,
    '',
    '## Scenario Summaries',
    '',
    ...runs.flatMap((run) => [
      `- ${run.scenario}: avgP95=${run.summary.avgP95Ms}ms, avgP99=${run.summary.avgP99Ms}ms, avgThroughput=${run.summary.avgThroughputRps} req/s`,
    ]),
    '',
    '## Trend vs Previous Snapshot',
    '',
  ];

  if (trend.baseline) {
    lines.push('- Baseline run only (no previous snapshot available).');
  } else if (trend.deltas.length === 0) {
    lines.push('- No comparable endpoints found with previous snapshot.');
  } else {
    const topRegressions = [...trend.deltas]
      .sort((a, b) => b.p95DeltaMs - a.p95DeltaMs)
      .slice(0, 10);
    const topImprovements = [...trend.deltas]
      .sort((a, b) => a.p95DeltaMs - b.p95DeltaMs)
      .slice(0, 10);

    lines.push('### Largest P95 Regressions');
    lines.push(...topRegressions.map((item) => `- ${item.scenario}/${item.endpoint}: p95 ${item.p95DeltaMs}ms`));
    lines.push('');
    lines.push('### Largest P95 Improvements');
    lines.push(...topImprovements.map((item) => `- ${item.scenario}/${item.endpoint}: p95 ${item.p95DeltaMs}ms`));
  }

  const trendMdPath = path.join(artifactsDir, 'performance-trend.md');
  await writeText(trendMdPath, `${lines.join('\n')}\n`);
  console.log(`Phase 8 performance report written to ${path.relative(root, trendMdPath)}`);
}

main().catch((error) => {
  console.error('Failed to generate Phase 8 performance report.');
  console.error(error);
  process.exit(1);
});

