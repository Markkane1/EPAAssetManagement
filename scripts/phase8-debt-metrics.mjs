import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collectFiles,
  countPatternMatches,
  getMonthKey,
  lineCount,
  runCommand,
  writeJson,
} from './phase8-utils.mjs';

const SOURCE_DIRS = ['server/src', 'client/src'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const OUTLIER_LINE_THRESHOLD = 400;

async function captureCommandStatus(command, args) {
  const startedAt = Date.now();
  const result = await runCommand(command, args, { passthrough: true });
  return {
    command: [command, ...args].join(' '),
    status: result.code === 0 ? 'pass' : 'fail',
    exitCode: result.code,
    durationMs: Date.now() - startedAt,
  };
}

async function main() {
  const root = process.cwd();
  const monthKey = getMonthKey();
  const artifactsDir = path.join(root, 'artifacts', 'phase8', monthKey);
  const skipHealthChecks = process.argv.includes('--skip-health-checks');
  const sourceFiles = [];

  for (const rel of SOURCE_DIRS) {
    const abs = path.join(root, rel);
    const collected = await collectFiles(abs, EXTENSIONS);
    sourceFiles.push(...collected);
  }

  let tsNoCheckCount = 0;
  let explicitAnyCount = 0;
  let schemaAnyCount = 0;
  let modelAnyCount = 0;
  const hotspots = [];

  for (const absolutePath of sourceFiles) {
    const content = await fs.readFile(absolutePath, 'utf8');
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
    const lines = lineCount(content);

    tsNoCheckCount += countPatternMatches(content, /@ts-nocheck/g);
    explicitAnyCount += countPatternMatches(content, /\bany\b/g);
    schemaAnyCount += countPatternMatches(content, /Schema<\s*any\s*>/g);
    modelAnyCount += countPatternMatches(content, /model<\s*any\s*>/g);

    if (lines >= OUTLIER_LINE_THRESHOLD) {
      hotspots.push({ file: relativePath, lines });
    }
  }

  hotspots.sort((a, b) => b.lines - a.lines);

  const testHealth = [];
  if (skipHealthChecks) {
    testHealth.push({
      command: 'health checks skipped',
      status: 'skipped',
      exitCode: 0,
      durationMs: 0,
    });
  } else {
    testHealth.push(await captureCommandStatus('npm', ['run', 'test:security', '-w', 'server']));
    testHealth.push(await captureCommandStatus('npm', ['run', 'test:consumables', '-w', 'server']));
    testHealth.push(await captureCommandStatus('npm', ['run', 'lint:server']));
    testHealth.push(await captureCommandStatus('npm', ['run', 'lint', '-w', 'client']));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    monthKey,
    counts: {
      tsNoCheckCount,
      explicitAnyCount,
      schemaAnyCount,
      modelAnyCount,
      outlierFilesCount: hotspots.length,
      trackedSourceFiles: sourceFiles.length,
    },
    outlierFiles: hotspots.slice(0, 30),
    testHealth,
  };

  const targetFile = path.join(artifactsDir, 'debt-metrics.json');
  await writeJson(targetFile, report);
  console.log(`Phase 8 debt metrics written to ${path.relative(root, targetFile)}`);
}

main().catch((error) => {
  console.error('Failed to generate Phase 8 debt metrics.');
  console.error(error);
  process.exit(1);
});
