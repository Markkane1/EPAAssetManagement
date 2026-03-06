# Vibe Code Audit

Generated on: 2026-03-06

## Critical

None confirmed in this pass.

## Medium

None open after this pass.

## Low

None open after this pass.

## Informational

### Resolved in this pass
- `client/src/lib/api.ts` now centralizes API URL resolution and defaults to same-origin `/api` with a Vite dev proxy.
- `client/src/pages/Dashboard.tsx` no longer fires employee-side unauthorized background queries.
- `client/src/components/layout/Header.tsx` no longer fetches notifications before auth state settles.
- `client/src/pages/Projects.tsx` now opens a real project details dialog.
- `client/src/pages/Vendors.tsx` now opens a real vendor details dialog.

### `dangerouslySetInnerHTML` usage appears internal-only
- **File:** `client/src/components/ui/chart.tsx:70`
- **Finding:** The app uses `dangerouslySetInnerHTML`, but in this pass it appeared limited to internal chart styling rather than user-derived HTML.
- **Impact:** Not currently flagged as XSS, but it should stay isolated from user/API HTML.

### High-confidence orphaned code candidates from `ts-prune`
- **File:** `server/src/middleware/auth.ts:185`
  - `optionalAuth`
- **File:** `server/src/repositories/vendor.repository.ts:4`
  - `vendorRepository`
- **File:** `server/src/services/backgroundScheduler.service.ts:91`
  - `stopBackgroundScheduler`
- **Finding:** These exports were reported as unused by `npx ts-prune`.
- **Impact:** Low runtime risk, but they increase maintenance cost and make it harder to tell what code paths are real.
- **Recommended action:** Confirm usage manually and remove or wire them intentionally.

## Test Artifacts

- `tests/e2e/console-hygiene.spec.ts`
- `tests/e2e/page-smoke.spec.ts`
- `tests/e2e/auth.spec.ts`
- `BUGS_FOUND.md`
