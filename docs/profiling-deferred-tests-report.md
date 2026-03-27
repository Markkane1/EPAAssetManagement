# Profiling And Deferred Test Report

Captured on 2026-03-26 / 2026-03-27 against the synthetic profiling dataset `ams_profile_codex`.

## Backend profiling

### Explain plans

Source: `docs/profile-backend-explains.json`

- `notificationDedupe`: uses `recipient_user_id_1_office_id_1_type_1_entity_type_1_entity_id_1_created_at_-1`, `docsExamined=20`, `keysExamined=20`, `executionTimeMs=69`
- `dashboardScopedStats`: uses `holder_type_1_holder_id_1_is_active_1`, `docsExamined=45454`, `keysExamined=45455`, `executionTimeMs=1016`
- `employeeUserLookup`: uses `user_id_1`, `docsExamined=1`, `keysExamined=1`, `executionTimeMs=8`
- `requisitionList`: uses `office_id_1_status_1_created_at_-1`, `docsExamined=50`, `keysExamined=51`, `executionTimeMs=7`
- `requisitionDetail`: uses `_id_`, `docsExamined=1`, `keysExamined=1`, `executionTimeMs=5`
- `requisitionDetailLines`: uses `requisition_id_1_created_at_1`, `docsExamined=80`, `keysExamined=80`, `executionTimeMs=13`
- `maintenanceReminderScheduledDate`: falls back to sort on top of `maintenance_status_1_created_at_-1`, `docsExamined=5000`, `keysExamined=5000`, `executionTimeMs=94`

### Load scenarios

Source: `docs/profile-load-results.json`

- `dashboard50kAssetItems`: `200`, avg `216.33ms`, min `142ms`, max `341ms`
- `employeeDashboardLargeEmployeeCollection`: `200`, avg `138.67ms`, min `97ms`, max `172ms`
- `requisitionList`: `200`, avg `317.33ms`, min `218ms`, max `429ms`
- `requisitionDetail`: `200`, avg `317.67ms`, min `155ms`, max `543ms`
- `requisitionFulfillmentManyLinesLots`: `400` in `4154ms`

### Worker stress runs

These were executed as isolated profiling runs rather than inside the test suite.

- Initial runs exposed a cursor bug in both workers: checkpoint dates were being rebuilt through `String(date)`, which dropped millisecond precision and could cause the same last row to be reselected forever.
- The fix now preserves exact `Date` values in:
  - `server/src/services/maintenanceReminderWorker.service.ts`
  - `server/src/services/thresholdAlertWorker.service.ts`
- Post-fix `runThresholdAlertWorker()`: completed in `3735ms`, inserted `80` notifications.
- Post-fix `runMaintenanceReminderWorker()`: still did not complete cleanly on the large synthetic profiling dataset; the isolated run ended with a `MongoNetworkTimeoutError` against the local `27018` replica-set after about `126s`.

The earlier worker hang reproduced in `tests/integration/runtime/reports/scheduler-workers.runtime-test.ts` is resolved after the cursor fix.

## Browser profiling

Sources:

- `docs/profile-browser-dashboard.json`
- `docs/profile-browser-requisitiondetail.json`
- `docs/profile-browser-datatableassetitems.json`
- `docs/profile-browser-datatableemployees.json`
- `docs/profile-browser-datatableassignments.json`
- `docs/profile-browser-reports.json`
- `docs/profile-browser-consumablesinventory.json`
- `docs/profile-browser-consumablesledger.json`

### Route timings

- `Dashboard`: `DOMContentLoaded=325ms`, `FCP=404ms`, `LCP=1420ms`
- `RequisitionDetail`: browser capture timed out after `60000ms`
- `AssetItems`: `DOMContentLoaded=289ms`, `FCP=368ms`, `LCP=1548ms`
- `Employees`: `DOMContentLoaded=1156ms`, `FCP=1280ms`, `LCP=2880ms`
- `Assignments`: `DOMContentLoaded=1262ms`, `FCP=1404ms`, `LCP=3300ms`
- `Reports`: `DOMContentLoaded=282ms`, `FCP=396ms`, `LCP=1288ms`
- `ConsumablesInventory`: `DOMContentLoaded=1433ms`, `FCP=1568ms`, `LCP=1868ms`
- `ConsumablesLedger`: `DOMContentLoaded=296ms`, `FCP=424ms`, `LCP=1088ms`

## Deferred test execution

### Passed

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:components`
- `npm run test:e2e`
- `npm run test:security`
- `npm run test:reports -w server`
- `npm run test:runtime`
- `npm run test:consumables`
- `npm run test:requisition -w server`
- `npm run test:returns -w server`
- `npm run test:transfers -w server`
- `npm run test:all`
- `npm run build:client:budget`
- `npm run migrate:search-terms -w server -- --dry-run`

### Notes

- The earlier aggregate `test:all` failure was environmental. Stale workspace-owned `node` processes from prior profiling runs interfered with the Playwright E2E startup path. After cleaning those processes, `npm run test:all` passed.
- `build:client:budget` passed. Largest raw chunks stayed under the configured `600 kB` budget.
- `migrate:search-terms -- --dry-run` completed successfully on the current small local data set.
