# Legacy Cleanup Manifest

Purpose: flag legacy/backward-compatibility code that now has a newer implementation, so removals can be done safely and in order.

Status labels:
- `SAFE_NOW`: newer path is already live and this shim can be removed now.
- `SAFE_AFTER_DATA_MIGRATION`: remove only after DB records are migrated and validated.
- `SAFE_AFTER_CLIENT_UPDATE`: remove only after client/API callers stop sending old fields.
- `KEEP_FOR_SCRIPTS_ONLY`: not used by runtime APIs, but still used by scripts/tests.

## Removal Candidates

| ID | Status | Legacy code | Newer implementation already in repo | Files to change/remove | Safety gate before removal |
|---|---|---|---|---|---|
| L-001 | SAFE_NOW | Deprecated route stubs for old consumable endpoints | Consumables module routes under `/api/consumables/*` | `server/src/routes/index.ts` | Confirm no client calls `/api/consumable-assignments` and `/api/consumable-consumptions`. |
| L-002 | SAFE_AFTER_CLIENT_UPDATE | Role alias normalization (`super_admin`, `admin`, etc.) | Canonical role set: `org_admin`, `office_head`, `caretaker`, `employee` | `server/src/utils/roles.ts` | Ensure all callers send canonical roles and run `server/scripts/migrate-user-roles.ts` on all environments. |
| L-003 | SAFE_AFTER_DATA_MIGRATION | Asset item fallback `location_id` + output transform fallback | Canonical holder model: `holder_type` + `holder_id` | `server/src/models/assetItem.model.ts` | Verify all `asset_items` have `holder_type` and `holder_id` populated. |
| L-004 | SAFE_AFTER_DATA_MIGRATION | Client fallback to asset `location_id` | Same canonical holder model (`holder_type`/`holder_id`) | `client/src/lib/assetItemHolder.ts` | Same gate as L-003, plus client smoke test on asset lists and assignment flows. |
| L-005 | SAFE_AFTER_CLIENT_UPDATE | Office input aliases and deprecated office fields (`parent_location_id`, `lab_code`, `is_headoffice`) | Canonical `parent_office_id` and newer office/sub-location workflow | `server/src/controllers/office.controller.ts`, `server/src/models/office.model.ts`, `client/src/types/index.ts`, `client/src/components/forms/OfficeFormModal.tsx`, `client/src/pages/consumables/ConsumableLocations.tsx`, `server/src/modules/consumables/controllers/consumableLocation.controller.ts` | Confirm API consumers only use canonical fields and data is migrated. |
| L-006 | SAFE_AFTER_DATA_MIGRATION | Transfer single-line fallback (`asset_item_id` at root) and old timestamp fields | Transfer `lines[]` workflow is implemented | `server/src/models/transfer.model.ts`, `server/src/controllers/transfer.controller.ts`, `client/src/pages/Transfers.tsx` | Ensure all transfers have non-empty `lines[]`; backfill old rows first. |
| L-007 | SAFE_AFTER_CLIENT_UPDATE | Legacy upload field aliases for signed slips (`signedFile`, `file`) | New explicit slip upload endpoints and signed fields | `server/src/routes/assignment.routes.ts`, `server/src/controllers/assignment.controller.ts` | Confirm clients send only `signedHandoverFile` / `signedReturnFile`. |
| L-008 | SAFE_NOW | Old immediate-return endpoint shim (`PUT /assignments/:id/return`) returning 400 | Return-slip workflow endpoints are implemented | `server/src/routes/assignment.routes.ts`, `server/src/controllers/assignment.controller.ts` | Confirm UI does not call the old route. |
| L-009 | SAFE_AFTER_CLIENT_UPDATE | Consumables inventory legacy input keys (`locationId`, `fromLocationId`, `toLocationId`) | Canonical holder-based keys in inventory service | `server/src/modules/consumables/services/inventory.service.ts` | Confirm all callers pass canonical holder keys; monitor 400s after staging. |
| L-010 | SAFE_AFTER_DATA_MIGRATION | Deprecated consumables compatibility fields (`location_id`, `from_location_id`, `to_location_id`) | Canonical holder fields (`holder_type`/`holder_id`, `from_holder_*`, `to_holder_*`) | `server/src/modules/consumables/models/consumableInventoryBalance.model.ts`, `server/src/modules/consumables/models/consumableInventoryTransaction.model.ts`, `client/src/pages/consumables/ConsumableInventory.tsx`, `client/src/pages/consumables/ConsumableLedger.tsx`, `client/src/types/index.ts` | Ensure historical records have holder fields populated and client reads holder fields only. |
| L-011 | SAFE_AFTER_DATA_MIGRATION | Fallback reads from legacy consumable model in module controllers | Consumable module item model and routes are implemented | `server/src/modules/consumables/controllers/consumableIssue.controller.ts`, `server/src/modules/consumables/controllers/consumableConsumption.controller.ts`, `server/src/modules/consumables/controllers/consumableReturn.controller.ts`, `server/src/modules/consumables/controllers/consumableLot.controller.ts` | Verify all lots/issues/returns resolve via canonical module item references without fallback. |
| L-012 | KEEP_FOR_SCRIPTS_ONLY | Legacy root consumable models still referenced by migration/perf scripts | Runtime APIs use module models | `server/src/models/consumableAssignment.model.ts`, `server/src/models/consumableConsumption.model.ts`, `server/scripts/migrate-consumables-build-balances.ts`, `server/tests/performance/remaining-read-benchmark.ts` | Remove only after scripts/tests are updated to module-only datasets. |

## Recommended Removal Order

1. Remove `SAFE_NOW` items: L-001, L-008.
2. Run data migrations and verify counts, then remove `SAFE_AFTER_DATA_MIGRATION`: L-003, L-004, L-006, L-010, L-011.
3. Update all clients/callers and contract docs, then remove `SAFE_AFTER_CLIENT_UPDATE`: L-002, L-005, L-007, L-009.
4. Finally clean script-only legacy models: L-012.

## Quick Validation Checklist (per PR)

- API smoke tests pass for auth, offices, assets, requisitions, assignments, consumables.
- UI smoke tests pass for transfers, assignment slips, consumable inventory/ledger.
- No runtime `rg` hits remain for the removed legacy key(s).
- Migration scripts produce expected summaries before and after cleanup.
