import fs from 'node:fs/promises';
import path from 'node:path';
import { getMonthKey, runCommand, safeParseJson, writeJson, writeText } from './phase8-utils.mjs';

function summarizeVulnerabilities(auditJson) {
  const totals = auditJson?.metadata?.vulnerabilities || {};
  return {
    total: Number(totals.total || 0),
    critical: Number(totals.critical || 0),
    high: Number(totals.high || 0),
    moderate: Number(totals.moderate || 0),
    low: Number(totals.low || 0),
    info: Number(totals.info || 0),
  };
}

function evaluatePolicyChecks({ appContent, authContent, rateLimitContent, envContent }) {
  return [
    {
      id: 'csrf_middleware_registered',
      status: /csrf/i.test(appContent) ? 'pass' : 'fail',
      evidence: 'server/src/app.ts',
    },
    {
      id: 'helmet_enabled',
      status: /helmet\s*\(/.test(appContent) ? 'pass' : 'fail',
      evidence: 'server/src/app.ts',
    },
    {
      id: 'auth_requires_jwt_secret',
      status: /assertSecret\('JWT_SECRET'/.test(envContent) ? 'pass' : 'fail',
      evidence: 'server/src/config/env.ts',
    },
    {
      id: 'token_invalidation_supported',
      status: /jwtInvalidateBefore/.test(authContent) ? 'pass' : 'fail',
      evidence: 'server/src/middleware/auth.ts',
    },
    {
      id: 'rate_limit_backend_configurable',
      status: /RATE_LIMIT_BACKEND|rateLimitBackend/.test(rateLimitContent) ? 'pass' : 'fail',
      evidence: 'server/src/middleware/rateLimit.ts',
    },
  ];
}

async function main() {
  const root = process.cwd();
  const monthKey = getMonthKey();
  const artifactsDir = path.join(root, 'artifacts', 'phase8', monthKey);
  const skipRuntimeTest = process.argv.includes('--skip-runtime-test');

  const [appContent, authContent, rateLimitContent, envContent] = await Promise.all([
    fs.readFile(path.join(root, 'server/src/app.ts'), 'utf8'),
    fs.readFile(path.join(root, 'server/src/middleware/auth.ts'), 'utf8'),
    fs.readFile(path.join(root, 'server/src/middleware/rateLimit.ts'), 'utf8'),
    fs.readFile(path.join(root, 'server/src/config/env.ts'), 'utf8'),
  ]);

  const securityTest = skipRuntimeTest
    ? { code: 0 }
    : await runCommand('npm', ['run', 'test:security', '-w', 'server'], { passthrough: true });
  const audit = await runCommand('npm', ['audit', '--workspaces', '--json']);
  const auditJson = safeParseJson(audit.stdout) || {};
  const vulnerabilitySummary = summarizeVulnerabilities(auditJson);
  const policyChecks = evaluatePolicyChecks({ appContent, authContent, rateLimitContent, envContent });

  const report = {
    generatedAt: new Date().toISOString(),
    monthKey,
    securityRuntimeTests: {
      status: skipRuntimeTest ? 'skipped' : securityTest.code === 0 ? 'pass' : 'fail',
      exitCode: securityTest.code,
    },
    dependencyAdvisories: vulnerabilitySummary,
    policyChecks,
  };

  const reportJsonPath = path.join(artifactsDir, 'security-posture.json');
  await writeJson(reportJsonPath, report);

  const lines = [
    '# Phase 8 Security Posture',
    '',
    `- Generated At: ${report.generatedAt}`,
    `- Month: ${monthKey}`,
    '',
    '## Runtime Security Tests',
    '',
    `- Status: ${report.securityRuntimeTests.status.toUpperCase()}`,
    `- Exit Code: ${report.securityRuntimeTests.exitCode}`,
    '',
    '## Dependency Advisories',
    '',
    `- Total: ${vulnerabilitySummary.total}`,
    `- Critical: ${vulnerabilitySummary.critical}`,
    `- High: ${vulnerabilitySummary.high}`,
    `- Moderate: ${vulnerabilitySummary.moderate}`,
    `- Low: ${vulnerabilitySummary.low}`,
    '',
    '## Security Policy Drift Checks',
    '',
    ...policyChecks.map((check) => `- ${check.id}: ${check.status.toUpperCase()} (${check.evidence})`),
    '',
  ];

  const reportMdPath = path.join(artifactsDir, 'security-posture.md');
  await writeText(reportMdPath, `${lines.join('\n')}\n`);
  console.log(`Phase 8 security posture written to ${path.relative(root, reportMdPath)}`);
}

main().catch((error) => {
  console.error('Failed to generate Phase 8 security posture report.');
  console.error(error);
  process.exit(1);
});
