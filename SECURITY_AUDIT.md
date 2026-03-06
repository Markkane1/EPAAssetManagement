# SECURITY_AUDIT

Generated on: 2026-03-06
Workspace: `d:/web temps/AMS/AMS With Backend`
Audit approach: runtime Supertest security suites under `server/tests/security/*.runtime-test.ts`, static review of server/client code, and live `npm audit`.
Note: the repo test harness is TypeScript-based, so the requested security tests were implemented as `*.runtime-test.ts` files under `server/tests/security/` instead of Jest `.js` files.

## [SEC-001] JWT verification now rejects algorithm confusion, algorithm switching, invalid signatures, expired tokens, and tokens without `exp`

- **Severity:**     High
- **Category:**     JWT
- **Session:**      S1
- **File/Route:**   server/src/middleware/auth.ts:32
- **Description:**  JWT verification is pinned to `HS256`, rejects tokens without a numeric `exp`, and no longer accepts malformed or downgraded tokens.
- **Impact:**       Prevents token forgery and session bypass through `alg:none`, algorithm switching, tampered signatures, and non-expiring tokens.
- **Reproduction:** 1. Craft `alg:none`, invalid-signature, expired, and missing-`exp` tokens. 2. Send them to protected routes such as `GET /api/auth/me`. 3. Observe `401` for all cases.
- **Fix:**          Added `JWT_ALLOWED_ALGORITHMS = ['HS256']`, required `exp`, and centralized verification in `verifyJwtToken()`.
- **Test:**         server/tests/security/jwt.runtime-test.ts -> `should reject alg:none tokens across protected routes`
- **Status:**       Resolved

## [SEC-002] Session issuance uses expiring JWTs in httpOnly cookies instead of exposing bearer tokens to client storage

- **Severity:**     High
- **Category:**     JWT
- **Session:**      S1
- **File/Route:**   server/src/controllers/auth.controller.ts:35
- **Description:**  Auth tokens are signed with `expiresIn`, written to an `httpOnly` `auth_token` cookie, and the API response intentionally does not return a usable bearer token.
- **Impact:**       Reduces token theft risk from frontend XSS and ensures sessions expire.
- **Reproduction:** 1. Log in via `POST /api/auth/login`. 2. Observe `Set-Cookie: auth_token=...; HttpOnly` and `token: undefined` in the JSON body.
- **Fix:**          `signToken()` always sets `expiresIn`; `setAuthCookie()` stores the token as `httpOnly`; the client stores only normalized user metadata.
- **Test:**         server/tests/security/jwt.runtime-test.ts -> `issued login token should include exp` 
- **Status:**       Resolved

## [SEC-003] Request sanitization and safe validation now block NoSQL operator payloads, XSS strings, invalid ObjectIds, and oversized/invalid uploads

- **Severity:**     High
- **Category:**     NoSQL Injection
- **Session:**      S2 / S4 / S7
- **File/Route:**   server/src/app.ts:47
- **Description:**  Request bodies, params, and queries are sanitized for Mongo operator keys and hostile string payloads before controller use. Error handling now converts cast, validation, and multer failures into safe `400/413` responses instead of `500` crashes.
- **Impact:**       Prevents common NoSQL injection payloads, reflected/stored XSS persistence, unsafe ObjectId casting crashes, and malformed upload crashes.
- **Reproduction:** 1. Send payloads like `{ "$gt": "" }`, `<script>alert(1)</script>`, `not-an-id`, and oversized uploads to write endpoints. 2. Observe sanitized behavior or `400/413`, not unintended data exposure or `500`.
- **Fix:**          Added recursive request sanitization in `createApp()` and safe cast/validation/multer handling in `errorHandler()`.
- **Test:**         server/tests/security/nosql-injection.runtime-test.ts -> `login should reject operator injection payloads`
- **Status:**       Resolved

## [SEC-004] Authentication and authorization checks now cover unauthenticated access, role tampering, IDOR denial, and one-time password reset tokens

- **Severity:**     High
- **Category:**     Auth
- **Session:**      S3
- **File/Route:**   server/src/controllers/auth.controller.ts:153
- **Description:**  Protected routes reject missing or invalid auth, registration rejects unknown or escalated roles, cross-user access checks hold, and password reset tokens cannot be reused after successful reset.
- **Impact:**       Prevents privilege escalation, broken function-level auth, and reset-token replay.
- **Reproduction:** 1. Attempt admin registration fields such as `role=org_admin` as a non-admin. 2. Attempt cross-user reads/writes and reused password reset tokens. 3. Observe `401/403/400` responses.
- **Fix:**          Hardened role validation with `assertKnownRole`, enforced route guards, and validated password-reset lifecycle.
- **Test:**         server/tests/security/authz.runtime-test.ts -> `profile and registration flows should ignore or reject role tampering payloads`
- **Status:**       Resolved

## [SEC-005] Express security baseline is enforced: Helmet headers, restricted CORS, auth rate limiting, request size limits, and generic 500 responses

- **Severity:**     High
- **Category:**     Config
- **Session:**      S5
- **File/Route:**   server/src/app.ts:134
- **Description:**  The API now returns the expected security headers, only allows configured origins, rate-limits auth routes, enforces body size limits, and suppresses stack traces/internal errors from client responses.
- **Impact:**       Reduces exposure to clickjacking, cross-origin abuse, brute-force login attempts, oversized-body abuse, and internal error leakage.
- **Reproduction:** 1. Send `Origin: https://evil.com` to API routes. 2. Flood `POST /api/auth/login`. 3. Force a server error. 4. Observe denied CORS, `429`, and generic `500` response bodies.
- **Fix:**          Enabled Helmet with CSP/frame protections, tightened CORS, used `createRateLimiter()` on auth routes, kept request-size limits active, and normalized server-side error responses.
- **Test:**         server/tests/security/api-security.runtime-test.ts -> `login should rate limit repeated failed attempts and emit retry-after`
- **Status:**       Resolved

## [SEC-006] File upload controls reject bad extensions, wrong content types, traversal names, oversized files, and unauthorized direct access

- **Severity:**     High
- **Category:**     Other
- **Session:**      S7
- **File/Route:**   server/src/middleware/errorHandler.ts:29
- **Description:**  Upload endpoints now fail safely for invalid types/extensions, large files, and unauthorized document access attempts.
- **Impact:**       Reduces risk of unsafe file upload storage, denial-of-service from oversized files, and file exposure across users.
- **Reproduction:** 1. Upload renamed executables or oversize payloads. 2. Attempt direct download access without authorization. 3. Observe `400/413/401/403` instead of acceptance or execution.
- **Fix:**          Added safe multer error mapping and runtime tests around document upload/download controls.
- **Test:**         server/tests/security/file-upload.runtime-test.ts -> `should reject blocked executable upload extensions with 400`
- **Status:**       Resolved

## [SEC-007] Vulnerable `xlsx` dependency removed from the client bundle

- **Severity:**     High
- **Category:**     Dependency
- **Session:**      S8
- **File/Route:**   client/src/components/shared/DataTable.tsx:430
- **Description:**  The vulnerable XLSX export path was removed from the shared table and page-level exports, and the `xlsx` dependency was uninstalled from the client workspace.
- **Impact:**       Eliminates the final high-severity dependency finding from `npm audit`.
- **Reproduction:** 1. Run `npm audit --audit-level=moderate --json`. 2. Observe zero vulnerabilities. 3. Run `npm ls xlsx --all`. 4. Observe no installed `xlsx` package.
- **Fix:**          Removed XLSX export UI/code paths and kept CSV/JSON export flows.
- **Test:**         audit-results.json -> zero vulnerabilities
- **Status:**       Resolved

## [SEC-008] Employee creation no longer auto-generates or exposes temporary passwords

- **Severity:**     Medium
- **Category:**     Other
- **Session:**      S6
- **File/Route:**   server/src/controllers/employee.controller.ts:262
- **Description:**  Employee creation now requires an explicit initial password, the backend no longer generates `tempPassword`, and the frontend no longer displays or expects temporary credentials.
- **Impact:**       Removes credential disclosure through API payloads, toasts, screenshots, and shared-screen exposure.
- **Reproduction:** 1. Attempt to create an employee without `userPassword`. 2. Observe `400 Initial password is required`. 3. Create with a password and observe no returned `tempPassword`.
- **Fix:**          Made `userPassword` mandatory for new employees, removed generated password logic from the server response, and removed the toast display.
- **Test:**         npm --prefix server run test:security -> passed after employee creation flow hardening
- **Status:**       Resolved

## [SEC-009] Backend secret removed from the repo root `.env`

- **Severity:**     Low
- **Category:**     Config
- **Session:**      S6
- **File/Route:**   .env
- **Description:**  The root `.env` now contains only client/public configuration. `JWT_SECRET` remains server-only in `server/.env`.
- **Impact:**       Reduces the chance of accidental secret exposure through frontend tooling or future config drift.
- **Reproduction:** 1. Open the root `.env`. 2. Observe only `VITE_API_BASE_URL` and non-secret local config values.
- **Fix:**          Removed `JWT_SECRET` from the root `.env` and kept backend secrets server-scoped.
- **Test:**         N/A (static analysis)
- **Status:**       Resolved

## [SEC-010] Frontend token storage review found no auth token in `localStorage` or `sessionStorage`

- **Severity:**     Informational
- **Category:**     Other
- **Session:**      S6
- **File/Route:**   client/src/services/authService.ts:109
- **Description:**  The frontend stores only a normalized `user` object in `localStorage`. Auth state relies on the backend `auth_token` httpOnly cookie and CSRF token cookie/header pairing.
- **Impact:**       Reduces XSS impact relative to bearer-token storage in Web Storage.
- **Reproduction:** 1. Inspect frontend storage code. 2. Observe `localStorage.setItem('user', ...)` but no token persistence calls.
- **Fix:**          No immediate change required; keep auth tokens cookie-bound.
- **Test:**         N/A (static analysis)
- **Status:**       Resolved

## [SEC-011] `dangerouslySetInnerHTML` exists only for generated chart CSS, not user-controlled HTML

- **Severity:**     Informational
- **Category:**     XSS
- **Session:**      S4 / S6
- **File/Route:**   client/src/components/ui/chart.tsx:70
- **Description:**  The only `dangerouslySetInnerHTML` usage writes generated CSS variables for charts and is not sourced from user input or API HTML.
- **Impact:**       Current usage is low risk, but any future expansion to user-derived HTML would become a direct XSS sink.
- **Reproduction:** 1. Inspect `ChartStyle`. 2. Observe that the HTML content is built from chart config/color constants rather than user text.
- **Fix:**          No immediate change required; keep this sink isolated from API/user-derived data.
- **Test:**         N/A (static analysis)
- **Status:**       Resolved

## [SEC-012] Browser-based tooling for ZAP and Playwright was not available in the local environment

- **Severity:**     Informational
- **Category:**     Other
- **Session:**      S6 / S9
- **File/Route:**   local tooling
- **Description:**  `zap-baseline.py` and `playwright` were not installed locally, so browser-driven checks were covered via header assertions, static analysis, and Supertest route fuzzing instead.
- **Impact:**       Leaves a gap in browser-automation evidence, though the server-side protections were still exercised.
- **Reproduction:** 1. Run `Get-Command zap-baseline.py` and `Get-Command playwright`. 2. Observe they are unavailable.
- **Fix:**          Install Playwright and OWASP ZAP if you want browser-level regression tests and automated DAST in this workspace.
- **Test:**         server/tests/security/pentest-simulation.runtime-test.ts -> `write routes should not return 500 during fuzzing`
- **Status:**       Open

## Validation Summary

- `npm --prefix server run lint` -> passed
- `npm --prefix server run test:security` -> passed
- `npm --prefix client run lint` -> passed with pre-existing warnings in `client/src/pages/Maintenance.tsx`
- `npm --prefix client run build` -> passed
- `npm audit --audit-level=moderate --json` -> 0 vulnerabilities
- `npm ls xlsx --all` -> no installed `xlsx` package
- `npm audit fix --package-lock-only` -> previously cleared the transitive `dompurify` advisory before the final dependency cleanup
- `npx retire --js --node` -> tool now reports that Node package scanning is no longer supported and defers to `npm audit`

## Final Security Checklist

JWT
- [x] alg:none tokens rejected on all protected routes
- [x] Expired tokens rejected
- [x] All tokens have exp claim
- [x] Tokens stored in httpOnly cookies, not localStorage

MONGODB
- [x] express-mongo-sanitize installed and active
- [x] NoSQL operator injection returns 400 or safe denial on tested routes
- [x] Invalid ObjectId returns 400, not 500

AUTHENTICATION & AUTHORIZATION
- [x] All protected routes return 401 with no/bad token
- [x] IDOR tested between two users on covered resources
- [x] Admin routes return 403 for regular users
- [x] Role fields (isAdmin, role) cannot be set via request body

INPUT & XSS
- [x] XSS payloads sanitized or rejected on tested string fields
- [x] No dangerouslySetInnerHTML with user-derived data
- [x] All security headers present (helmet configured)
- [x] Request size limited (Express body limits active)

EXPRESS & API
- [x] CORS restricted to known origins
- [x] Rate limiting on auth routes
- [x] No stack traces in error responses
- [x] No sensitive fields (`password`, `password_hash`, `__v`) in tested API responses

REACT FRONTEND
- [x] No secrets in `REACT_APP_` / `VITE_` env vars
- [x] No tokens or passwords in localStorage
- [x] No sensitive data in client `console.log` calls
- [x] No hardcoded credentials in frontend source files

DEPENDENCIES
- [x] npm audit shows zero Critical or High findings
- [x] Lock file committed to repo
- [x] `dompurify` transitive advisory cleared from live audit output
- [x] `xlsx` removed from the client dependency tree

FILE UPLOADS (applicable)
- [x] File type validated server-side
- [x] File size limited
- [x] Filename/path traversal attempts rejected
- [x] Private file access requires authorization

OUTPUTS
- [x] SECURITY_AUDIT.md reviewed and updated
- [x] All Critical findings resolved before deploy
- [x] All High findings resolved or have a documented mitigation plan

## Recommended Next Actions

1. Install Playwright and OWASP ZAP if you want browser-level regression evidence in addition to the current Supertest/static coverage.
