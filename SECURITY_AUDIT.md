# SECURITY_AUDIT

Generated on: 2026-03-03
Evidence sources: `server/tests/security/security-runtime-tests.ts`, `server/src/app.ts`, `server/src/routes/auth.routes.ts`, `audit-results.json`, `retire-results.json`.

## [SEC-001] Express security middleware baseline implemented (helmet + input sanitization)

- **Severity:**     High
- **Category:**     Config
- **Session:**      S5
- **File/Route:**   server/src/app.ts
- **Description:**  Added runtime middleware stack for `helmet`, NoSQL key sanitization (`express-mongo-sanitize` helper), and XSS payload cleaning (`xss-clean` helper) across body/params/query.
- **Impact:**       Reduces exploitability of reflected/stored script payloads and Mongo operator payload abuse.
- **Reproduction:** 1. Send operator payloads (`$set`, `$where`) and script payloads in request data. 2. Observe payload normalization/sanitization before controller use.
- **Fix:**          Middleware wired in `createApp()` before routes with in-place request object sanitization wrappers for Express 5 compatibility.
- **Test:**         server/tests/security/security-runtime-tests.ts -> "Mongo operator payload must be sanitized and not applied"
- **Status:**       Resolved

## [SEC-002] Auth brute-force throttle enforced on auth routes

- **Severity:**     High
- **Category:**     Auth
- **Session:**      S5
- **File/Route:**   POST /api/auth/login
- **Description:**  Added rate limiting (10 attempts / 15 minutes per IP+email key) and verified 429 behavior.
- **Impact:**       Reduces credential stuffing and password guessing risk.
- **Reproduction:** 1. Submit repeated failed logins (>10) quickly. 2. Observe `429` and `Retry-After` header.
- **Fix:**          `createRateLimiter` applied in `server/src/routes/auth.routes.ts` for login and reset endpoints.
- **Test:**         server/tests/security/security-runtime-tests.ts -> "Login brute-force should be rate limited with HTTP 429"
- **Status:**       Resolved

## [SEC-003] CSRF protection enforced for cookie-authenticated mutations

- **Severity:**     High
- **Category:**     Auth
- **Session:**      S5
- **File/Route:**   POST /api/auth/change-password, POST /api/auth/logout, POST /api/auth/register
- **Description:**  State-changing auth endpoints now reject missing/invalid CSRF tokens for cookie-based sessions.
- **Impact:**       Prevents cross-site request forgery for privileged account actions.
- **Reproduction:** 1. Authenticate via cookie. 2. Call mutation endpoints without `x-csrf-token`. 3. Observe `403`.
- **Fix:**          `requireCsrf` middleware checks cookie/header token match and is attached on sensitive auth routes.
- **Test:**         server/tests/security/security-runtime-tests.ts -> CSRF negative-path assertions
- **Status:**       Resolved

## [SEC-004] Privilege escalation and unauthorized writes blocked

- **Severity:**     High
- **Category:**     Auth
- **Session:**      S3
- **File/Route:**   POST /api/auth/register, POST /api/offices, POST /api/vendors, PUT /api/settings
- **Description:**  Unauthenticated and low-privilege actors are blocked from admin writes and role escalation paths.
- **Impact:**       Prevents attacker-driven account/role elevation and unauthorized config mutation.
- **Reproduction:** 1. Attempt registration/admin writes as unauthenticated or employee role. 2. Verify 401/403 responses.
- **Fix:**          Route-level `requireAuth`/`requireAdmin` guards and controller-level checks.
- **Test:**         server/tests/security/security-runtime-tests.ts -> unauth write denial and escalation denial checks
- **Status:**       Resolved

## [SEC-005] Cross-office horizontal authorization checks enforced

- **Severity:**     High
- **Category:**     IDOR
- **Session:**      S3
- **File/Route:**   PUT/DELETE /api/assignments/:id, PUT/DELETE /api/maintenance/:id, GET /api/activities/user/:userId
- **Description:**  Cross-office users cannot read or mutate records outside office scope.
- **Impact:**       Prevents horizontal privilege escalation between office tenants.
- **Reproduction:** 1. Create records in Office A. 2. Use Office B session to mutate/read. 3. Verify 403.
- **Fix:**          Scope checks in controllers and shared role/scope utilities.
- **Test:**         server/tests/security/security-runtime-tests.ts -> cross-office assignment/maintenance/activity checks
- **Status:**       Resolved

## [SEC-006] Password reset and token invalidation protections verified

- **Severity:**     High
- **Category:**     Auth
- **Session:**      S1
- **File/Route:**   POST /api/auth/forgot-password, POST /api/auth/reset-password, POST /api/auth/change-password
- **Description:**  Reset tokens are one-time use; old credentials and stale JWT token versions are rejected after password changes.
- **Impact:**       Limits account takeover persistence after credential changes.
- **Reproduction:** 1. Request reset token. 2. Reset once (success). 3. Reuse token (fails). 4. Use old JWT after password change (fails).
- **Fix:**          Token hash/version checks and password reset expiry/consume logic in auth flow.
- **Test:**         server/tests/security/security-runtime-tests.ts -> reset reuse + token-version invalidation checks
- **Status:**       Resolved

## [SEC-007] Vulnerable Rollup version remains in dependency tree

- **Severity:**     High
- **Category:**     Dependency
- **Session:**      S8
- **File/Route:**   client/node_modules/rollup (via Vite toolchain)
- **Description:**  `npm audit` reports Rollup Path Traversal advisory (`GHSA-mw96-cpmx-2vgc`) for resolved version 4.57.1.
- **Impact:**       Primarily build-time/dev-tooling exposure; still a supply-chain risk.
- **Reproduction:** 1. Run `npm audit --audit-level=high`. 2. Observe `rollup` high severity finding.
- **Fix:**          Upgrade resolved rollup to >= 4.59.0 once lockfile/workspace resolution permits stable install.
- **Test:**         audit-results.json
- **Status:**       Open

## [SEC-008] xlsx dependency has unresolved high-severity advisories

- **Severity:**     High
- **Category:**     Dependency
- **Session:**      S8
- **File/Route:**   node_modules/xlsx
- **Description:**  `xlsx` is flagged for Prototype Pollution and ReDoS (`GHSA-4r6h-8v6p-xvw6`, `GHSA-5pgg-2g8v-p4x9`), with no direct fix available in current advisory output.
- **Impact:**       Malicious spreadsheet payload handling risk where untrusted files are processed.
- **Reproduction:** 1. Run `npm audit --audit-level=high`. 2. Observe `xlsx` high findings with `fixAvailable: false`.
- **Fix:**          Replace `xlsx` with a maintained alternative or isolate/sandbox spreadsheet parsing and strictly validate uploaded files.
- **Test:**         audit-results.json
- **Status:**       Open

## [SEC-009] Frontend bundle scan via RetireJS returned no vulnerable libraries

- **Severity:**     Informational
- **Category:**     Dependency
- **Session:**      S6
- **File/Route:**   dist/*
- **Description:**  RetireJS scan against built frontend assets reported no vulnerable JS libraries.
- **Impact:**       Indicates no known vulnerable browser library signatures were detected in current bundle output.
- **Reproduction:** 1. Build client (`npm run build:client`). 2. Run `npx retire --path dist --outputformat json --outputpath retire-results.json`.
- **Fix:**          Continue scanning in CI and pin/upgrade libraries proactively.
- **Test:**         retire-results.json
- **Status:**       Resolved

## Current Audit Snapshot

- `npm audit --audit-level=high`: **2 high, 0 critical** (rollup, xlsx)
- `retire` bundle scan: **0 findings**
- Security runtime suite: **passing** (`npm run test:security -w server`)
