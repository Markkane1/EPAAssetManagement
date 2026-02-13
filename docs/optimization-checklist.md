# AMS Optimization Overview And Execution Checklist

## Current Baseline (Observed)

- Frontend production build has a very large main chunk:
  - `dist/assets/index-CzGnshMp.js`: `1,859.30 kB` (gzip `524.24 kB`)
  - Build output also reports chunk size warnings.
- Route modules are eagerly imported in `client/src/App.tsx` (`import ... from "./pages/..."` across lines ~9-56), so almost the whole app is loaded on first paint.
- Vite config in `client/vite.config.ts` has no explicit chunking strategy (`manualChunks`) and no optimization-oriented build tuning yet.
- Backend dashboard endpoints do collection-wide reads and in-memory filtering in `server/src/controllers/dashboard.controller.ts`:
  - `AssetItemModel.find()` then `.filter(...)`
  - `AssetModel.find()` then `.reduce(...)`
  - `ConsumableModel.find(...)` then `.filter(...)`
- Pagination is not standardized across many list endpoints (for example `assignment.controller.ts` list and several controllers using `Model.find().sort(...)` with no page/limit contract).
- Several high-query models have no supporting indexes for common filters/sorts:
  - `server/src/models/assetItem.model.ts`
  - `server/src/models/asset.model.ts`
  - `server/src/models/consumable.model.ts`
  - `server/src/models/maintenanceRecord.model.ts`
  - `server/src/models/purchaseOrder.model.ts`
- `client/src/components/shared/DataTable.tsx` computes filter/slice directly each render (not memoized), which can become expensive on larger datasets.

## Execution Checklist

## Phase 0: Guardrails And Baselines

- [ ] Capture current frontend bundle report (`npm run build -w client`) and save artifact in CI logs.
- [ ] Add a lightweight API timing baseline (request duration + endpoint + status) for key endpoints.
- [ ] Define target budgets:
  - Main initial JS chunk under `600 kB` minified.
  - Dashboard API p95 latency under `300 ms` on staging dataset.

## Phase 1: Frontend Load-Time Optimization (Highest ROI)

- [ ] Convert route imports in `client/src/App.tsx` to `React.lazy` + `Suspense` route-level code splitting.
- [ ] Keep auth/login shell in initial bundle; lazy-load feature pages (`reports`, `consumables`, admin pages).
- [ ] Add manual chunking in `client/vite.config.ts` for heavy libraries:
  - `recharts`
  - `jspdf` / `jspdf-autotable`
  - `html2canvas`
  - editor/utility groups if needed
- [ ] Rebuild and verify:
  - Initial main chunk decreases substantially.
  - No route navigation regressions.

## Phase 2: Frontend Render And Data-Fetch Efficiency

- [ ] Memoize expensive table transforms in `client/src/components/shared/DataTable.tsx` using `useMemo` for `filteredData` and `paginatedData`.
- [ ] Add server-side pagination path for large datasets used in tables before increasing page size.
- [ ] Centralize React Query defaults in the `QueryClient` creation in `client/src/App.tsx`:
  - `staleTime`
  - `gcTime`/cache window
  - `refetchOnWindowFocus` by data criticality
- [ ] Remove duplicate per-hook query options when they match defaults to reduce config drift.
- [ ] In report-heavy pages (`client/src/pages/Reports.tsx`), replace repeated nested `.filter(...)` patterns with precomputed maps for O(n) grouping.

## Phase 3: Backend Query Optimization (Highest Runtime Impact)

- [ ] Refactor `server/src/controllers/dashboard.controller.ts` to use MongoDB aggregation/count queries instead of fetching full collections.
- [ ] For recent activity endpoints, project only required fields (`select`) and use `.lean()` for read-only operations.
- [ ] Standardize list endpoints with query contract:
  - `page`, `limit`, optional `sortBy`, `sortDir`
  - enforce max `limit` to prevent expensive scans.
- [ ] Replace broad `find()` calls with filtered queries tied to office/access scope where possible.

## Phase 4: Database Indexing

- [ ] Add compound indexes aligned to real query patterns:
  - `asset_items`: `(location_id, is_active)`, `(asset_id, is_active)`, `(item_status, is_active)`
  - `assignments`: `(employee_id, assigned_date)`, `(asset_item_id, assigned_date)`
  - `assets`: `(category_id, is_active)`, `(vendor_id, is_active)`, `(created_at)`
  - `purchase_orders`: `(status, order_date)`, `(vendor_id, order_date)`
  - `maintenance_records`: `(asset_item_id, created_at)`, `(maintenance_status, created_at)`
  - `consumables`: `(is_active, category_id)`
- [ ] Run explain plans for top endpoints before/after index creation and confirm index utilization.

## Phase 5: Transport And API Efficiency

- [ ] Add response compression middleware for API responses in `server/src/app.ts` (skip already-compressed/binary paths).
- [ ] Ensure all list endpoints return only needed fields for table views.
- [ ] Add ETag/conditional cache headers for relatively static reference datasets (categories, offices, units).

## Phase 6: Reliability And Regression Protection

- [ ] Add performance regression checks to CI:
  - fail build if main chunk exceeds agreed budget.
  - run representative API benchmark smoke test for dashboard + list endpoints.
- [ ] Keep existing functional/security tests green after each optimization batch.
- [ ] Run staging soak test with realistic data volume and compare p50/p95 before release.

## Validation Commands

- Frontend build baseline:
  - `npm run build -w client`
- Backend tests:
  - `npm run test:security -w server`
  - `npm run test:consumables -w server`
- Quick endpoint sanity after backend changes:
  - `npm run dev:server`
  - hit `/health`, dashboard stats, assignments list, reports-related endpoints.

## Recommended Execution Order

- [ ] Batch 1: Phase 1 (route splitting + chunking) and re-measure.
- [ ] Batch 2: Phase 3 dashboard query rewrite + Phase 4 indexes for impacted collections.
- [ ] Batch 3: Phase 2 table/report compute cleanup.
- [ ] Batch 4: Phase 5 transport optimizations and CI budgets from Phase 6.

