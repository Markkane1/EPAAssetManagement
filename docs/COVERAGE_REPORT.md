# Coverage Report

Generated on: 2026-03-07

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

- **Statements:** 37.06% (8207 / 22145)
- **Branches:** 24.39% (4354 / 17850)
- **Functions:** 35.37% (1785 / 5046)
- **Lines:** 38.32% (7709 / 20117)

## What Changed In This Pass

This pass targeted the remaining zero-heavy client pages and thin client API wrappers instead of deepening already-covered modules.

Added in this pass:
- `tests/components/client-page-gap-batch-2.test.tsx`
- `tests/unit/client-services-batch.test.ts`
- `tests/unit/client-ui-hooks-batch.test.tsx`

New coverage from this pass includes:
- auth-adjacent and admin pages:
  - `ForgotPassword`
  - `NotificationDetails`
  - `Settings`
  - `RoleDelegations`
  - `UserActivity`
  - `AuditLogs`
  - `Compliance`
  - `NotFound`
- requisition and inventory pages:
  - `RequisitionNew`
  - `TransferDetail`
  - `Assignments`
  - `InventoryHub`
  - `MyAssets`
- thin service wrappers now directly exercised:
  - `requisitionService`
  - `notificationService`
  - `userService`
  - `reportService`
  - `returnRequestService`
  - `consumableInventoryService`
- client UI utilities now directly exercised:
  - `useConsumableMode`
  - `toaster`
  - `skeleton`

## High-Value Coverage After This Pass

Representative files materially lifted in this batch:

- `client/src/pages/ForgotPassword.tsx` - 90.90%
- `client/src/pages/NotificationDetails.tsx` - 66.03%
- `client/src/pages/Settings.tsx` - 56.92%
- `client/src/pages/RoleDelegations.tsx` - 61.64%
- `client/src/pages/UserActivity.tsx` - 87.09%
- `client/src/pages/RequisitionNew.tsx` - 75.00%
- `client/src/pages/TransferDetail.tsx` - 85.29%
- `client/src/pages/Assignments.tsx` - 79.03%
- `client/src/pages/InventoryHub.tsx` - 87.80%
- `client/src/pages/MyAssets.tsx` - 93.33%
- `client/src/pages/AuditLogs.tsx` - 93.33%
- `client/src/pages/Compliance.tsx` - 72.00%
- `client/src/pages/NotFound.tsx` - 100%
- `client/src/services/requisitionService.ts` - 100%
- `client/src/services/notificationService.ts` - 100%
- `client/src/services/userService.ts` - 100%
- `client/src/services/reportService.ts` - 100%
- `client/src/services/returnRequestService.ts` - 100%
- `client/src/services/consumableInventoryService.ts` - 100%
- `client/src/hooks/useConsumableMode.ts` - 87.50%
- `client/src/components/ui/toaster.tsx` - 100%
- `client/src/components/ui/skeleton.tsx` - 100%

## Remaining True Zero-Coverage Files

Representative files still at 0% after this pass:

- `client/src/components/forms/EmployeeTransferModal.tsx`
- `client/src/components/forms/index.ts`
- `client/src/components/shared/AssignmentHistoryModal.tsx`
- `client/src/components/ui/use-toast.ts`
- `client/src/pages/AssetDetail.tsx`
- `client/src/pages/EmployeeDetail.tsx`
- `client/src/pages/Maintenance.tsx`
- `client/src/pages/Schemes.tsx`
- `client/src/pages/UserPermissions.tsx`
- `client/src/pages/consumables/ConsumableContainers.tsx`
- `client/src/pages/consumables/ConsumableDisposal.tsx`
- `client/src/pages/consumables/ConsumableExpiry.tsx`
- `client/src/pages/consumables/ConsumableLedger.tsx`
- `client/src/pages/consumables/ConsumableReceive.tsx`
- `client/src/pages/consumables/ConsumableUnits.tsx`
- `client/src/pages/reports/AssetItemsInventoryReport.tsx`
- `client/src/pages/reports/AssignmentSummaryReport.tsx`
- `client/src/pages/reports/EmployeeAssetsReport.tsx`
- `client/src/pages/reports/FinancialSummaryReport.tsx`
- `client/src/pages/reports/LocationInventoryReport.tsx`
- `client/src/pages/reports/MaintenanceReport.tsx`
- `client/src/pages/reports/StatusDistributionReport.tsx`
- `client/src/services/index.ts`
- `server/src/middleware/errorHandler.ts`
- `server/src/middleware/requestMetrics.ts`
- `server/src/modules/consumables/services/workflowNotification.service.ts`
- `server/src/modules/records/services/approval.service.ts`
- `server/src/modules/records/services/audit.service.ts`
- `server/src/modules/records/services/documentLink.service.ts`
- `server/src/modules/records/services/record.service.ts`
- `server/src/modules/records/services/recordDetail.service.ts`
- `server/src/services/approvalMatrix.service.ts`
- `server/src/services/assignmentSlip.service.ts`
- `server/src/services/maintenanceReminderWorker.service.ts`
- `server/src/services/policyEngine.service.ts`
- `server/src/services/requisitionIssuanceReport.service.ts`
- `server/src/services/returnRequestReceipt.service.ts`
- `server/src/services/seedAdmin.ts`
- `server/src/services/thresholdAlertWorker.service.ts`

## Threshold Status

The repo is stable and green, but the original target is still not met:

- Overall line coverage is **38.32%**, below the requested **70%**
- Overall statement coverage is **37.06%**, below the requested **70%**
- Several critical auth/user files are now healthy, but broad untouched client pages and server services still keep the repo below the original thresholds

## Validation State

Current validation state:

- `npm run test:coverage` passes
- 60 test files passed
- 475 tests passed

## Non-Failing Warnings

The suite still emits non-blocking warnings:

- React Router future-flag warnings in several component tests
- Radix dialog accessibility warning in `RecordDetailModal` tests because `DialogContent` lacks a description
