import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { chromium } from 'playwright';

const DB_NAME = 'ams_profile_codex';
const DB_URI = `mongodb://127.0.0.1:27018/${DB_NAME}?replicaSet=rs0`;
const WORKSPACE_ROOT = process.cwd();
const SERVER_PORT = '5001';
const CLIENT_PORT = '8081';
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const PASSWORD = 'Passw0rd!2026';

process.env.NODE_ENV = 'test';
process.env.LOAD_DOTENV_IN_TEST = 'false';
process.env.MONGO_URI = DB_URI;
process.env.MONGO_REQUIRE_REPLICA_SET = 'true';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.CORS_ORIGIN = `${CLIENT_URL},http://localhost:5173`;
process.env.JWT_EXPIRES_IN = '7d';
process.env.SEED_SUPER_ADMIN = 'false';
process.env.RATE_LIMIT_BACKEND = 'mongo';

const require = createRequire(import.meta.url);
const { connectDatabase } = require('../server/src/config/db');

type StartedProcess = {
  name: string;
  process: ReturnType<typeof spawn>;
};

async function waitForHttp(url: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startProcess(name: string, command: string, extraEnv: Record<string, string>) {
  const child = spawn(command, {
    cwd: WORKSPACE_ROOT,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  return { name, process: child };
}

async function stopProcess(started: StartedProcess) {
  if (started.process.exitCode != null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const killProcess = spawn(`taskkill /pid ${started.process.pid} /t /f`, {
      cwd: WORKSPACE_ROOT,
      shell: true,
      stdio: 'ignore',
    });
    killProcess.on('exit', () => resolve());
  });
}

async function solveCaptcha(page: any) {
  const challengeText =
    ((await page.locator('text=/Solve:/').first().locator('..').textContent()) || '')
      .replace(/\s+/g, ' ')
      .trim();
  const match = challengeText.match(/(\d+)\s*([+\-\u00d7xX])\s*(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse captcha challenge from: ${challengeText}`);
  }

  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);
  const answer = operator === '+' ? left + right : operator === '-' ? left - right : left * right;

  await page.getByPlaceholder('?').fill(String(answer));
}

async function login(page: any, email: string, password: string) {
  await page.goto(`${CLIENT_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await solveCaptcha(page);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/^(?!.*\/login$).+/, { timeout: 30000 });
}

async function captureRouteMetrics(page: any, routePath: string, label: string) {
  await page.addInitScript(() => {
    const globalWindow = window as typeof window & { __codexPerf?: { lcp: number | null } };
    globalWindow.__codexPerf = { lcp: null };
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries[entries.length - 1];
        if (latest) {
          globalWindow.__codexPerf = { lcp: latest.startTime };
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      globalWindow.__codexPerf = { lcp: null };
    }
  });

  try {
    await page.goto(`${CLIENT_URL}${routePath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);

    return page.evaluate((inputLabel) => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paintEntries = performance.getEntriesByType('paint');
      const firstContentfulPaint =
        paintEntries.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null;
      const perfWindow = window as typeof window & { __codexPerf?: { lcp: number | null } };

      return {
        label: inputLabel,
        path: window.location.pathname,
        status: 'ok',
        domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
        loadEventMs: navigation ? Math.round(navigation.loadEventEnd) : null,
        responseEndMs: navigation ? Math.round(navigation.responseEnd) : null,
        transferSize: navigation?.transferSize ?? null,
        encodedBodySize: navigation?.encodedBodySize ?? null,
        decodedBodySize: navigation?.decodedBodySize ?? null,
        firstContentfulPaintMs: firstContentfulPaint ? Math.round(firstContentfulPaint) : null,
        largestContentfulPaintMs:
          perfWindow.__codexPerf?.lcp != null ? Math.round(perfWindow.__codexPerf.lcp) : null,
        resourceCount: performance.getEntriesByType('resource').length,
        jsHeapUsedBytes:
          (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? null,
      };
    }, label);
  } catch (error: any) {
    return {
      label,
      path: routePath,
      status: 'error',
      error: error?.message || String(error),
    };
  }
}

async function main() {
  const requestedLabel = String(process.argv[2] || '').trim();
  await connectDatabase();
  const requisition = await mongoose.connection.db.collection('requisitions').findOne(
    { file_number: 'REQ-FULFILL-PERF-0001' },
    { projection: { _id: 1 } }
  );
  await mongoose.disconnect();

  if (!requisition?._id) {
    throw new Error('Expected profiling requisition was not found in ams_profile_codex');
  }

  const processes: StartedProcess[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    const serverProcess = startProcess('server', 'npm run dev:server', {
      NODE_ENV: 'test',
      LOAD_DOTENV_IN_TEST: 'false',
      PORT: SERVER_PORT,
      MONGO_URI: DB_URI,
      MONGO_REQUIRE_REPLICA_SET: 'true',
      JWT_SECRET: process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef',
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
      RATE_LIMIT_BACKEND: process.env.RATE_LIMIT_BACKEND || 'mongo',
      CORS_ORIGIN: `${CLIENT_URL},http://localhost:5173`,
      SEED_SUPER_ADMIN: 'false',
    });
    processes.push(serverProcess);

    const clientProcess = startProcess('client', 'npm run dev:client', {
      VITE_API_BASE_URL: `${SERVER_URL}/api`,
      VITE_API_PROXY_TARGET: SERVER_URL,
      VITE_DEV_PORT: CLIENT_PORT,
    });
    processes.push(clientProcess);

    await waitForHttp(`${SERVER_URL}/health`, 180000);
    await waitForHttp(CLIENT_URL, 180000);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page, 'admin@test.example', PASSWORD);

    const outputFileName = requestedLabel
      ? `profile-browser-${requestedLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
      : 'profile-browser-results.json';
    const outputPath = path.resolve(process.cwd(), 'docs', outputFileName);
    const routeDefinitions = [
      { path: '/', label: 'Dashboard' },
      { path: `/requisitions/${String(requisition._id)}`, label: 'RequisitionDetail' },
      { path: '/asset-items', label: 'DataTableAssetItems' },
      { path: '/employees', label: 'DataTableEmployees' },
      { path: '/assignments', label: 'DataTableAssignments' },
      { path: '/reports', label: 'Reports' },
      { path: '/consumables/inventory', label: 'ConsumablesInventory' },
      { path: '/consumables/ledger', label: 'ConsumablesLedger' },
    ];
    const selectedRoutes = requestedLabel
      ? routeDefinitions.filter((route) => route.label.toLowerCase() === requestedLabel.toLowerCase())
      : routeDefinitions;

    if (selectedRoutes.length === 0) {
      throw new Error(`Unknown route label: ${requestedLabel}`);
    }

    const results = {
      database: DB_NAME,
      capturedAt: new Date().toISOString(),
      routes: [] as any[],
    };

    await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    for (const route of selectedRoutes) {
      console.log(`Capturing ${route.label}`);
      const routeResult = await Promise.race([
        captureRouteMetrics(page, route.path, route.label),
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                label: route.label,
                path: route.path,
                status: 'error',
                error: 'Timed out after 60000ms',
              }),
            60000
          )
        ),
      ]);
      results.routes.push(routeResult);
      await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
    while (processes.length > 0) {
      const started = processes.pop();
      if (started) {
        await stopProcess(started);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
