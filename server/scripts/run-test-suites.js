const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TEST_FILE_PATTERN = /((\.|-)runtime-tests?|(\.|-)runtime-test|\.test|\.spec)\.ts$/i;

const SUITES = {
  security: ['security'],
  consumables: ['consumables'],
  requisition: ['requisition'],
  returns: ['return-requests'],
  reports: ['reports'],
  employees: ['employees'],
  office: ['office-sub-locations'],
  assetItems: ['asset-items'],
  runtime: ['asset-items', 'employees', 'office-sub-locations', 'requisition', 'return-requests', 'reports'],
  all: [
    'security',
    'consumables',
    'asset-items',
    'employees',
    'office-sub-locations',
    'requisition',
    'return-requests',
    'reports',
  ],
};

function printUsage() {
  console.log('Usage: node scripts/run-test-suites.js <suite> [--list] [--dry-run]');
  console.log(`Available suites: ${Object.keys(SUITES).join(', ')}`);
}

function collectTestFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }
    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveTestFiles(serverRoot, suiteName) {
  const folders = SUITES[suiteName];
  if (!folders) {
    throw new Error(`Unknown suite "${suiteName}"`);
  }
  const testsRoot = path.join(serverRoot, 'tests');
  const files = folders.flatMap((folder) => collectTestFiles(path.join(testsRoot, folder)));
  return files.sort((a, b) => a.localeCompare(b));
}

function resolveTsxCliPath(serverRoot) {
  const workspaceRoot = path.resolve(serverRoot, '..');
  const candidates = [
    path.join(serverRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(workspaceRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `tsx CLI not found. Checked:\n- ${candidates.join('\n- ')}\nRun npm install at workspace root.`
  );
}

function runTestFiles(serverRoot, files) {
  const tsxCliPath = resolveTsxCliPath(serverRoot);

  for (const filePath of files) {
    const relPath = path.relative(serverRoot, filePath).replace(/\\/g, '/');
    console.log(`\n[TEST] ${relPath}`);

    const result = spawnSync(process.execPath, [tsxCliPath, filePath], {
      cwd: serverRoot,
      stdio: 'inherit',
      env: process.env,
    });

    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const shouldList = args.includes('--list');
  const dryRun = args.includes('--dry-run');
  const suiteName = args.find((arg) => !arg.startsWith('--'));
  const serverRoot = path.resolve(__dirname, '..');

  if (!suiteName) {
    printUsage();
    process.exit(1);
  }

  if (!SUITES[suiteName]) {
    printUsage();
    process.exit(1);
  }

  const files = resolveTestFiles(serverRoot, suiteName);
  if (files.length === 0) {
    console.log(`No test files found for suite "${suiteName}".`);
    process.exit(0);
  }

  if (shouldList || dryRun) {
    console.log(`Suite "${suiteName}" has ${files.length} test file(s):`);
    for (const filePath of files) {
      console.log(`- ${path.relative(serverRoot, filePath).replace(/\\/g, '/')}`);
    }
    return;
  }

  runTestFiles(serverRoot, files);
}

main();
