import fs from 'node:fs/promises';
import path from 'node:path';
import { getMonthKey, safeParseJson } from './phase8-utils.mjs';

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = safeParseJson(raw);
  if (!parsed) {
    throw new Error(`Invalid JSON at ${filePath}`);
  }
  return parsed;
}

async function main() {
  const root = process.cwd();
  const monthKey = getMonthKey();

  const baselinePath = path.join(root, 'artifacts', 'phase8', 'baseline-thresholds.json');
  const debtPath = path.join(root, 'artifacts', 'phase8', monthKey, 'debt-metrics.json');
  const securityPath = path.join(root, 'artifacts', 'phase8', monthKey, 'security-posture.json');

  const [baseline, debt, security] = await Promise.all([
    readJson(baselinePath),
    readJson(debtPath),
    readJson(securityPath),
  ]);

  const checks = [
    {
      label: 'tsNoCheckCount',
      current: Number(debt?.counts?.tsNoCheckCount || 0),
      max: Number(baseline?.debtMax?.tsNoCheckCount ?? 0),
    },
    {
      label: 'explicitAnyCount',
      current: Number(debt?.counts?.explicitAnyCount || 0),
      max: Number(baseline?.debtMax?.explicitAnyCount ?? 0),
    },
    {
      label: 'schemaAnyCount',
      current: Number(debt?.counts?.schemaAnyCount || 0),
      max: Number(baseline?.debtMax?.schemaAnyCount ?? 0),
    },
    {
      label: 'modelAnyCount',
      current: Number(debt?.counts?.modelAnyCount || 0),
      max: Number(baseline?.debtMax?.modelAnyCount ?? 0),
    },
    {
      label: 'outlierFilesCount',
      current: Number(debt?.counts?.outlierFilesCount || 0),
      max: Number(baseline?.debtMax?.outlierFilesCount ?? 0),
    },
    {
      label: 'dependencyHighCritical',
      current: Number(security?.dependencyAdvisories?.high || 0) + Number(security?.dependencyAdvisories?.critical || 0),
      max: Number(baseline?.securityMax?.highCriticalAdvisories ?? 0),
    },
  ];

  const failures = checks.filter((check) => check.current > check.max);
  checks.forEach((check) => {
    console.log(`${check.label}: current=${check.current}, max=${check.max}`);
  });

  if (failures.length > 0) {
    console.error('Phase 8 no-regression check failed:');
    failures.forEach((failure) => {
      console.error(`- ${failure.label}: current ${failure.current} exceeds max ${failure.max}`);
    });
    process.exit(1);
  }

  console.log('Phase 8 no-regression check passed.');
}

main().catch((error) => {
  console.error('Failed to run Phase 8 no-regression check.');
  console.error(error);
  process.exit(1);
});

