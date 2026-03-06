# Coverage Report

Generated on: 2026-03-06

## Command

Coverage data in this report comes from:

```bash
npm run test:coverage
```

Underlying command:

```bash
vitest run tests/unit tests/components --coverage --coverage.reporter=text-summary --coverage.reporter=html --coverage.reporter=json-summary --passWithNoTests
```

Source file:
- `coverage/vitest/coverage-summary.json`

## Overall Coverage

- **Statements:** 7.51% (1665 / 22145)
- **Branches:** 4.61% (823 / 17850)
- **Functions:** 5.74% (290 / 5046)
- **Lines:** 7.97% (1604 / 20117)

## What Changed In This Pass

- The coverage run is now stable. Previous aggregate runs timed out in model and component suites.
- `test:coverage` now uses Vitest's native V8 coverage instead of wrapping Vitest in `c8`, because the `c8 vitest ...` combination was producing a false `0%` table for this TypeScript + JSDOM setup.
- Added focused coverage on:
  - `client/src/lib/api.ts`
  - `client/src/components/layout/Header.tsx`
  - `client/src/pages/Profile.tsx`
  - `client/src/pages/Projects.tsx`
  - `client/src/pages/Vendors.tsx`
  - `server/src/middleware/auth.ts`
  - `server/src/controllers/auth.controller.ts`

## Auth / User Data Surfaces

These were previously reported as effectively uncovered. Current line coverage:

- `client/src/lib/api.ts` - 76.14%
- `client/src/components/layout/Header.tsx` - 63.88%
- `client/src/pages/Profile.tsx` - 68.42%
- `server/src/middleware/auth.ts` - 62.88%
- `server/src/controllers/auth.controller.ts` - 33.06%

## Files Above 70% Line Coverage

- `server/src/utils/requestParsing.ts` - 100%
- `server/src/utils/passwordPolicy.ts` - 100%
- `server/src/utils/httpError.ts` - 100%
- `server/src/utils/scope.ts` - 100%
- `server/src/utils/categoryScope.ts` - 100%
- `server/src/utils/accessControl.ts` - 100%
- `server/src/utils/roles.ts` - 96.61%
- `server/src/utils/rolePermissions.ts` - 97.56%
- `server/src/utils/assetHolder.ts` - 95%
- `client/src/lib/api.ts` - 76.14%
- `client/src/contexts/AuthContext.tsx` - covered in component tests at high line coverage
- `client/src/pages/Login.tsx` - covered in component tests at high line coverage
- `client/src/components/auth/CaptchaChallenge.tsx` - 89.47%
- `client/src/components/auth/ProtectedRoute.tsx` - 75%

## Still Below Target

The requested thresholds are still not met:

- Overall line coverage is **7.97%**, below the requested **70%**
- Auth / user-data surfaces are still below the requested **90%** threshold:
  - `server/src/controllers/auth.controller.ts`
  - `server/src/middleware/auth.ts`
  - `client/src/components/layout/Header.tsx`
  - `client/src/pages/Profile.tsx`
  - `client/src/lib/api.ts`

## Representative Remaining Gaps

- `client/src/App.tsx` - 0%
- `client/src/components/layout/MainLayout.tsx` - 0%
- `client/src/components/layout/Sidebar.tsx` - 0%
- `client/src/components/shared/DataTable.tsx` - 0%
- `client/src/pages/Dashboard.tsx` - 0%
- `server/src/controllers/requisition.controller.ts` - 0%
- `server/src/controllers/notification.controller.ts` - 0%
- `server/src/services/notification.service.ts` - 0%
- `server/src/modules/records/services/document.service.ts` - 0%
- `server/src/modules/records/services/approval.service.ts` - 0%
- `server/src/modules/consumables/services/inventory.service.ts` - 0%
- `server/src/utils/uploadValidation.ts` - 31.25%

## Minimum Next Tests To Move The Needle

1. Add component tests for `MainLayout`, `Sidebar`, and `DataTable`.
2. Add page tests for `Dashboard` and one representative CRUD page with table + modal flows.
3. Add focused unit tests for `server/src/utils/uploadValidation.ts` and `server/src/modules/records/utils/upload.ts`.
4. Add higher-branch auth controller tests for register, login, logout, password change, and error branches.
5. Add route-level coverage for server controllers currently only exercised by Jest runtime tests.

## Important Note

The workspace is now green from a stability perspective:

- `npm run test:all` passes
- `npm run test:coverage` passes and returns real numbers

What remains is breadth of coverage, not a broken coverage pipeline.
