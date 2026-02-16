import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function getMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function getWorkspaceRoot() {
  return process.cwd();
}

export async function ensureDir(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

export async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

export async function runCommand(command, args = [], options = {}) {
  const isWindows = process.platform === 'win32';
  const isNpmTool = command === 'npm' || command === 'npx';
  const useShell = Boolean(options.shell || (isWindows && isNpmTool));
  const executable = command;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd || process.cwd(),
      shell: useShell,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        if (options.passthrough) process.stdout.write(chunk);
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
        if (options.passthrough) process.stderr.write(chunk);
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: Number(code || 0),
        stdout,
        stderr,
      });
    });
  });
}

export async function collectFiles(rootDir, allowedExtensions, skipDirs = new Set(['node_modules', 'dist', '.git'])) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (allowedExtensions.has(extension)) {
        files.push(absolutePath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

export function countPatternMatches(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

export function lineCount(content) {
  if (!content) return 0;
  return content.split(/\r?\n/u).length;
}

export function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function extractJsonBlock(raw) {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first < 0 || last < first) {
    return null;
  }
  return raw.slice(first, last + 1);
}
