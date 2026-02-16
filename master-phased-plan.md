# AMS Master Phased Plan (Security + Cleanup + Optimization)

> Last Updated: February 16, 2026  
> Scope: `AMS With Backend` repository  
> Source Inputs: `security-phased-plan.md`, `cleanup-phased-plan.md`, `optimization-phased-plan.md`  
> Status: Consolidated, execution-ready

---

## Purpose

This is the single execution roadmap for AMS hardening and quality.  
It combines security, cleanup, and optimization into one prioritized sequence with shared gates and measurable outcomes.

---

## Prioritization Policy

- `P0`: Exploitable security risk, data exposure risk, or release blocker.
- `P1`: Correctness/maintainability debt that materially increases regression risk.
- `P2`: Performance/scalability debt with measurable user or infrastructure impact.
- `P3`: Long-tail hardening and continuous quality ratchet.

Execution order is risk-first: security containment, then correctness/type safety, then deep optimization.

---

## Unified Critical Snapshot

- `P0`: Cross-office authorization gaps in assignment/maintenance mutation paths.
- `P0`: Secrets and runtime artifacts tracked in Git history/current tree.
- `P1`: Security runtime tests stale and currently failing.
- `P1`: `@ts-nocheck` in `11` backend files and `any` usage at `373`.
- `P1`: ESLint type-safety rules disabled (`no-explicit-any`, `no-unused-vars`).
- `P1`: Oversized controllers in requisition/assignment/return/transfer flows.
- `P2`: Unbounded `findAll()` list/select patterns and inconsistent large pagination caps.
- `P2`: Minimal Mongo connection tuning and no shared read-cache strategy.
- `P2`: Inconsistent cache-control/ETag policy and large eager admin fetches.

---

## Success Criteria (Definition of Done)

- [ ] Cross-office mutation bypasses are blocked and regression-tested.
- [ ] Secrets and runtime upload artifacts are not tracked in Git.
- [ ] Security runtime suite is green in CI.
- [ ] `@ts-nocheck` is eliminated (or exception-tracked with expiry).
- [ ] `any` usage is reduced by at least 70% in critical paths.
- [ ] Top large controllers are decomposed and maintainable.
- [ ] Unbounded query/list endpoints are removed from hot paths.
- [ ] Key endpoint P95 and payload size improve versus baseline.
- [ ] Shared gates (lint/build/tests/perf checks) pass on every phase.

---

## Phase 0: Emergency Containment + Baseline Lock (`P0`, Day 0-2)

- [ ] Hotfix/restrict risky mutation endpoints until full authorization patches land:
  - [ ] `PUT /api/assignments/:id`
  - [ ] `DELETE /api/assignments/:id`
  - [ ] `PUT /api/maintenance/:id`
  - [ ] `DELETE /api/maintenance/:id`
- [ ] Rotate `JWT_SECRET` and invalidate active sessions/tokens.
- [ ] Freeze baseline metrics:
  - [ ] security failing scenarios and expected denials
  - [ ] cleanup debt counters (`@ts-nocheck`, `any`, file-size hotspots)
  - [ ] performance baseline (`server/tests/performance/remaining-read-benchmark.ts`)

Verification:
- [ ] Unauthorized cross-office mutation requests return `403`.
- [ ] Pre-rotation tokens fail after secret rotation.
- [ ] Baseline artifacts are committed and reproducible.

---

## Phase 1: Authorization and Test Correctness (`P0/P1`, Week 1)

- [ ] Implement explicit office-scope checks for assignment update/remove.
- [ ] Implement explicit office-scope checks for maintenance update/remove.
- [ ] Update stale security fixtures/enums/roles and stabilize `test:security`.
- [ ] Add regression tests for cross-office denial.
- [ ] Add server lint script and align workspace quality gates.

Verification:
- [ ] `npm run test:security -w server` passes.
- [ ] New authorization regression tests pass.
- [ ] Shared lint/build/test gates run successfully locally.

---

## Phase 2: Secret/Artifact Hygiene + Type-Safety Bootstrap (`P1`, Week 1-2)

- [ ] Remove `.env` and `server/.env` from Git tracking and prevent re-tracking.
- [ ] Remove tracked runtime uploads from Git tracking and clean ignore rules.
- [ ] Rotate any historically exposed credentials.
- [ ] Remove `@ts-nocheck` from highest-risk workflow files first.
- [ ] Replace broad `any` in auth/requisition/assignment/return/transfer critical paths.

Verification:
- [ ] `git ls-files` excludes secrets and upload artifacts.
- [ ] Target high-risk files compile without `@ts-nocheck`.
- [ ] Phase debt reduction metrics are recorded.

---

## Phase 3: Authentication Hardening + Standards Enforcement (`P1`, Week 2-3)

- [x] Implement secure password reset flow (token, expiry, one-time use).
- [x] Add server-side lockout/backoff for repeated login failures.
- [x] Enforce stronger password policy in reset/change endpoints.
- [x] Add token/session invalidation strategy after password changes.
- [x] Add CSRF protection for cookie-auth mutation routes.
- [x] Re-enable strict ESLint rules incrementally (`no-unused-vars`, `no-explicit-any`).
- [x] Add cleanup/security standards doc (or `CONTRIBUTING.md`) and pre-commit checks.

Verification:
- [x] Reset/lockout/session invalidation/CSRF tests pass.
- [x] Lint rules are enforced with manageable violation backlog.

---

## Phase 4: Structural Cleanup and Contract Consistency (`P1/P2`, Week 3-4)

- [x] Decompose oversized controllers:
  - [x] `requisition.controller.ts`
  - [x] `assignment.controller.ts`
  - [x] `returnRequest.controller.ts`
  - [x] `transfer.controller.ts`
- [x] Keep controllers thin (`parse -> delegate -> respond`).
- [x] Standardize validation usage on mutation/query endpoints.
- [x] Centralize duplicated helpers (`clampInt`, parsing, normalization, regex helpers).
- [x] Consolidate client API base URL usage to shared API client layer.

Verification:
- [x] Controller sizes and duplication trend down with measurable deltas.
- [x] Validation/contract checks are consistently applied.

---

## Phase 5: Query and Database Performance Core (`P2`, Week 4-5)

- [x] Replace unbounded `findAll()` list/select patterns in hot endpoints.
- [x] Enforce consistent pagination defaults and max caps.
- [x] Apply projection profiles and `.lean()` discipline for read-heavy paths.
- [x] Profile/refactor heavy multi-query report assembly paths.
- [x] Configure Mongo connection pool/timeouts/retries by environment.
- [x] Validate index coverage for top hot query shapes.

Verification:
- [x] Query plans and timings show measurable improvement.
- [x] No hot UI flow relies on full-collection reads.

---

## Phase 6: API/Frontend Efficiency + Abuse Controls (`P2`, Week 5-6)

- [x] Standardize cache policy matrix by endpoint class.
- [x] Add/standardize conditional GET behavior (ETag + `Cache-Control`) where safe.
- [x] Tune compression thresholds by measured payload profile.
- [x] Replace large eager admin fetches with paged queries.
- [x] Add table/list virtualization where large rows affect UX.
- [x] Replace in-memory auth limiter with distributed limiter backend.
- [x] Tune trusted proxy policy, helmet policy set, and route request-size limits.

Verification:
- [x] Bandwidth, P95, and UI responsiveness improve on target workflows.
- [x] Rate-limiting behavior is consistent across instances/restarts.

---

## Phase 7: Upload/Dependency Hardening + Observability (`P2/P3`, Week 6+)

- [x] Add upload magic-byte validation aligned with MIME/extension/size checks.
- [x] Remediate or risk-accept current dependency advisories with ownership.
- [x] Continue model typing migration away from `Schema<any>` / `model<any>`.
- [x] Add HTTP latency/error metrics and DB query duration metrics.
- [x] Add cache hit/miss metrics after server-side caching rollout.
- [x] Enforce client bundle budget checks in CI.

Verification:
- [x] Spoofed uploads are rejected.
- [x] Security/performance dashboards expose actionable signals.

---

## Phase 8: Full Validation and Continuous Ratchet (`P3`, Ongoing)

- [x] Execute full load, spike, and soak scenarios for core AMS workflows.
- [x] Track monthly debt burn-down (`any`, `@ts-nocheck`, outlier file sizes, test health).
- [x] Track monthly security posture review (auth abuse, dependencies, policy drift).
- [x] Track monthly performance trend report (P95/P99, payload, throughput).
- [x] Require cleanup/security/perf acceptance checks for changes in high-debt modules.

Verification:
- [ ] Trends improve release-over-release.
- [x] No net increase in high-risk or high-debt hotspots.

---

## Unified Regression Gates (Run Every Phase)

- [ ] `npm run lint -w client`
- [ ] `npm run build -w server`
- [ ] `npm run build -w client`
- [ ] `npm run test:security -w server`
- [ ] `npm run test:consumables -w server`
- [ ] Performance checks:
  - [ ] benchmark run with before/after artifacts
  - [ ] bundle budget check (`npm run perf:bundle`)
- [ ] Security smoke checks:
  - [ ] login/logout/me
  - [ ] cross-office access boundaries
  - [ ] password reset/change/session invalidation
  - [ ] signed upload/download authorization
- [ ] Workflow smoke checks:
  - [ ] dashboard/activity
  - [ ] requisition lifecycle + signed issuance
  - [ ] assignment/return lifecycle + signed return
  - [ ] transfer transitions
  - [ ] consumables inventory/ledger heavy reads

---

## Unified Execution Log Template

### Master Phase `<N>` Execution Log

- Date:
- Owner:
- Scope:
- Security findings addressed:
- Cleanup debt reduced:
- Optimization deltas:
- Baseline metrics:
- Post-change metrics:
- Regressions found:
- Fixes applied:
- Residual risks:
- Signoff:

---

## Notes

- This plan is intentionally sequenced to reduce exploitability and regression risk before deep refactors.
- Keep `security-phased-plan.md`, `cleanup-phased-plan.md`, and `optimization-phased-plan.md` as domain references.
- Execute and track delivery against this master plan as the canonical roadmap.
