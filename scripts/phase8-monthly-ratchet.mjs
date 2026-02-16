import fs from 'node:fs/promises';
import path from 'node:path';
import { getMonthKey, runCommand, safeParseJson, writeText } from './phase8-utils.mjs';

async function runNodeScript(scriptName) {
  const result = await runCommand('node', [path.join('scripts', scriptName)], { passthrough: true });
  if (result.code !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.code}`);
  }
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return safeParseJson(raw);
  } catch {
    return null;
  }
}

async function main() {
  const root = process.cwd();
  const monthKey = getMonthKey();
  const artifactsDir = path.join(root, 'artifacts', 'phase8', monthKey);

  await runNodeScript('phase8-debt-metrics.mjs');
  await runNodeScript('phase8-security-posture.mjs');
  await runNodeScript('phase8-performance-report.mjs');

  const debt = await readJsonIfExists(path.join(artifactsDir, 'debt-metrics.json'));
  const security = await readJsonIfExists(path.join(artifactsDir, 'security-posture.json'));
  const performance = await readJsonIfExists(path.join(artifactsDir, 'performance-scenarios.json'));

  const lines = [
    '# Phase 8 Monthly Ratchet Summary',
    '',
    `- Generated At: ${new Date().toISOString()}`,
    `- Month: ${monthKey}`,
    '',
    '## Cleanup Debt Snapshot',
    '',
    `- @ts-nocheck count: ${debt?.counts?.tsNoCheckCount ?? 'n/a'}`,
    `- explicit any count: ${debt?.counts?.explicitAnyCount ?? 'n/a'}`,
    `- Schema<any> count: ${debt?.counts?.schemaAnyCount ?? 'n/a'}`,
    `- model<any> count: ${debt?.counts?.modelAnyCount ?? 'n/a'}`,
    `- outlier files (>=400 lines): ${debt?.counts?.outlierFilesCount ?? 'n/a'}`,
    '',
    '## Security Snapshot',
    '',
    `- security runtime tests: ${String(security?.securityRuntimeTests?.status || 'n/a').toUpperCase()}`,
    `- dependency advisories total: ${security?.dependencyAdvisories?.total ?? 'n/a'}`,
    `- critical: ${security?.dependencyAdvisories?.critical ?? 'n/a'}`,
    `- high: ${security?.dependencyAdvisories?.high ?? 'n/a'}`,
    '',
    '## Performance Snapshot',
    '',
    ...((performance?.runs || []).map(
      (run) =>
        `- ${run.scenario}: avgP95=${run.summary?.avgP95Ms ?? 'n/a'}ms, avgP99=${run.summary?.avgP99Ms ?? 'n/a'}ms, avgThroughput=${run.summary?.avgThroughputRps ?? 'n/a'} req/s`
    ) || []),
    '',
    '## Artifacts',
    '',
    `- artifacts/phase8/${monthKey}/debt-metrics.json`,
    `- artifacts/phase8/${monthKey}/security-posture.json`,
    `- artifacts/phase8/${monthKey}/security-posture.md`,
    `- artifacts/phase8/${monthKey}/performance-scenarios.json`,
    `- artifacts/phase8/${monthKey}/performance-trend.json`,
    `- artifacts/phase8/${monthKey}/performance-trend.md`,
    '',
  ];

  const summaryPath = path.join(artifactsDir, 'monthly-ratchet-summary.md');
  await writeText(summaryPath, `${lines.join('\n')}\n`);
  console.log(`Phase 8 monthly ratchet summary written to ${path.relative(root, summaryPath)}`);
}

main().catch((error) => {
  console.error('Failed to run Phase 8 monthly ratchet workflow.');
  console.error(error);
  process.exit(1);
});

