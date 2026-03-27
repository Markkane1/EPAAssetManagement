const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const TEST_FILE_PATTERN = /((\.|-)runtime-tests?|(\.|-)runtime-test|\.test|\.spec)\.ts$/i;
const RUNTIME_FILE_PATTERN = /((\.|-)runtime-tests?|(\.|-)runtime-test)\.ts$/i;
const SUITES = {
  security: ['tests/security'],
  consumables: ['tests/integration/runtime/consumables'],
  requisition: ['tests/integration/runtime/requisition'],
  returns: ['tests/integration/runtime/return-requests'],
  reports: ['tests/integration/runtime/reports'],
  transfers: ['tests/integration/runtime/transfers'],
  employees: ['tests/integration/runtime/employees'],
  office: ['tests/integration/runtime/office-sub-locations'],
  assetItems: ['tests/integration/runtime/asset-items'],
  runtime: [
    'tests/integration/runtime/asset-items',
    'tests/integration/runtime/employees',
    'tests/integration/runtime/office-sub-locations',
    'tests/integration/runtime/requisition',
    'tests/integration/runtime/return-requests',
    'tests/integration/runtime/reports',
    'tests/integration/runtime/transfers',
  ],
  all: [
    'tests/security',
    'tests/integration/runtime/consumables',
    'tests/integration/runtime/asset-items',
    'tests/integration/runtime/employees',
    'tests/integration/runtime/office-sub-locations',
    'tests/integration/runtime/requisition',
    'tests/integration/runtime/return-requests',
    'tests/integration/runtime/reports',
    'tests/integration/runtime/transfers',
  ],
};

function printUsage() {
  console.log('Usage: node scripts/run-test-suites.js <suite> [--list] [--dry-run]');
  console.log(`Available suites: ${Object.keys(SUITES).join(', ')}`);
}

function collectTestFiles(dir, pattern = TEST_FILE_PATTERN) {
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
    if (entry.isFile() && pattern.test(entry.name)) {
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
  const workspaceRoot = path.resolve(serverRoot, '..');
  const files = folders.flatMap((folder) => {
    const pattern = folder === 'tests/security' ? RUNTIME_FILE_PATTERN : TEST_FILE_PATTERN;
    return collectTestFiles(path.join(workspaceRoot, folder), pattern);
  });
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

async function runTestFiles(serverRoot, files) {
  const tsxCliPath = resolveTsxCliPath(serverRoot);
  const workspaceRoot = path.resolve(serverRoot, '..');
  const testCacheRoot = path.resolve(workspaceRoot, '..', '.ams-test-cache', path.basename(workspaceRoot));
  const mongoCacheDir = path.join(testCacheRoot, 'mongodb-binaries');
  const runtimeTmpDir = path.join(testCacheRoot, 'runtime-tmp');
  const mongoEnv = { ...process.env };

  fs.mkdirSync(mongoCacheDir, { recursive: true });
  fs.mkdirSync(runtimeTmpDir, { recursive: true });

  mongoEnv.MONGOMS_DOWNLOAD_DIR = mongoEnv.MONGOMS_DOWNLOAD_DIR || mongoCacheDir;
  mongoEnv.TMP = runtimeTmpDir;
  mongoEnv.TEMP = runtimeTmpDir;
  mongoEnv.TMPDIR = runtimeTmpDir;

  for (const filePath of files) {
    const relPath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
    console.log(`\n[TEST] ${relPath}`);

    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [tsxCliPath, filePath], {
        cwd: serverRoot,
        stdio: 'inherit',
        env: mongoEnv,
      });

      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (signal) {
          reject(new Error(`Test process exited with signal ${signal}`));
          return;
        }
        resolve(code ?? 0);
      });
    });

    if (exitCode !== 0) {
      console.error(`[TEST ERROR] ${relPath}`);
      process.exit(exitCode || 1);
    }
  }
}

async function main() {
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
    const workspaceRoot = path.resolve(serverRoot, '..');
    for (const filePath of files) {
      console.log(`- ${path.relative(workspaceRoot, filePath).replace(/\\/g, '/')}`);
    }
    return;
  }

  await runTestFiles(serverRoot, files);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
