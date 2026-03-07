# Performance Findings

Generated on: 2026-03-06

## Summary

- One integration performance guard was added and is passing:
  - `tests/integration/performance/list-endpoints.test.ts`
- This pass did not find a confirmed production memory leak, but it did find several code paths that deserve follow-up because they can degrade under load or make performance harder to reason about.

## High

### Missing index for employee lookup by `user_id`
- **File:** `server/src/controllers/user.controller.ts:27`
- **File:** `server/src/models/employee.model.ts:26`
- **Finding:** `ensureEmployeeProfileForUser()` queries `EmployeeModel.findOne({ user_id: input.userId })`, but `EmployeeSchema` does not define an index on `user_id`.
- **Impact:** User creation, role changes, and employee-profile reconciliation will degrade as the employee collection grows.
- **Recommended action:** Add an index on `user_id` and consider a normalized/indexed lookup path for email as well.

## Medium

### Requisition list enrichment shows an N+1 pattern
- **File:** `server/src/controllers/requisition.controller.ts:279`
- **File:** `server/src/controllers/requisition.controller.ts:493`
- **File:** `server/src/controllers/requisition.controller.ts:505`
- **Finding:** The controller iterates `for (const line of enrichedLines)` and performs per-line `findById()` lookups for related assets/consumables.
- **Impact:** Large requisitions can multiply query count and response latency.
- **Recommended action:** Preload related assets/consumables in bulk or move the enrichment into aggregation/prefetch maps.

### Document link ownership resolution is query-heavy
- **File:** `server/src/modules/records/services/documentLink.service.ts:24`
- **File:** `server/src/modules/records/services/documentLink.service.ts:48`
- **Finding:** The service resolves ownership with a chain of per-entity `findById()` calls, sometimes followed by more lookups for linked asset items.
- **Impact:** Attaching or checking document links across mixed entity types can become query-expensive.
- **Recommended action:** Cache common ownership lookups, denormalize office ownership where justified, or replace the branch chain with batched lookups.

### Dashboard controller still contains unfinished logic
- **File:** `server/src/controllers/dashboard.controller.ts:249`
- **Finding:** The controller still contains `// TODO: implement properly later`.
- **Impact:** Unfinished analytics code is a reliability and performance risk because later fixes often happen under production pressure.
- **Recommended action:** Finish or remove the incomplete branch before expanding dashboard usage.

## Low

### Background scheduler stop hook exists but is reported unused
- **File:** `server/src/services/backgroundScheduler.service.ts:17`
- **File:** `server/src/services/backgroundScheduler.service.ts:91`
- **Finding:** Scheduler lifecycle uses `setTimeout(...)`, and `stopBackgroundScheduler()` was reported unused by `ts-prune`.
- **Impact:** Low immediate risk, but restart/hot-reload/test harness scenarios are harder to reason about if shutdown hooks are not exercised.
- **Recommended action:** Confirm the scheduler is started exactly once and wire the stop hook into process shutdown/tests if needed.

## Passing Guard

### List endpoint query-count regression guard
- **File:** `tests/integration/performance/list-endpoints.test.ts`
- **What it checks:** `GET /api/users` with a 50-user page stays at four Mongo operations or fewer, including auth/context lookups, and does not expose `password`, `password_hash`, or `__v`.
- **Result:** Passing.

## Notable Gaps

- No automated N+1 query counter exists yet for requisitions, documents, or consumables flows.
- No automated heap/memory profiling was run in this pass.
- Jest/Playwright coverage does not currently feed the Vitest coverage report, so hot paths reached only through integration/E2E are underrepresented in the numeric coverage output.
