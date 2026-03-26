# Performance Hotspot Remediation

Scope:
- Surgical backend refactors only
- No route/page rewrites
- No blind schema redesign
- No new async/event side effects without existing idempotent guards
- Query counts below are static estimates from code inspection; no tests or runtime benchmarks were executed in this pass

## Hotspot Review

| Hotspot | Primary path(s) | Before | After | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Dashboard aggregations | `server/src/controllers/dashboard.controller.ts` | Office-scoped `getStatsInternal`: about 9 queries. Office-scoped `getAssetsByCategoryInternal`: about 4 queries. | Office-scoped `getStatsInternal`: about 7 queries. Office-scoped `getAssetsByCategoryInternal`: about 3 queries. | Refactored | Replaced `distinct` chains with `getOfficeScopedAssetOverview()` and moved recent-assignment scoping into an aggregate lookup. |
| Notification recipient resolution | `server/src/services/notification.service.ts` | `O(offices)` user queries or repeated event-local recipient lookups. Example: 25 offices meant about 25 recipient queries. | 1 bulk user query for all requested offices. | Refactored | `resolveNotificationRecipientsByOfficeMap()` preloads candidates once and fans out in memory. |
| Duplicate notification checks | `server/src/services/notification.service.ts` | `N` `exists()` checks plus recipient validation and insert. | 1 bulk duplicate scan + 1 recipient preload + 1 insert. | Refactored | `filterDuplicateNotifications()` now dedupes by identity in memory after one batched read. |
| Maintenance reminder loops | `server/src/services/maintenanceReminderWorker.service.ts` | 1 scheduled-record query + 1 asset-item query + `O(offices)` recipient lookups + `O(payload)` duplicate checks. | 1 scheduled-record query + 1 asset-item query + 1 recipient bulk lookup + 1 duplicate scan + 1 batch insert. | Refactored | Notifications are grouped by office before fan-out. |
| Threshold alert loops | `server/src/services/thresholdAlertWorker.service.ts`, `server/src/controllers/dashboard.controller.ts` | Low-stock and warranty paths previously paid repeated recipient resolution and duplicate checks per office/notification group. | Each branch is now aggregate/data preload + 1 recipient bulk lookup + 1 bulk dedupe/insert. | Refactored | Still synchronous, but no new async side effects were introduced. |
| Requisition fulfillment loops | `server/src/controllers/requisition.controller.ts` | Moveable flow did per-assignment issue-record existence checks and per-balance writes for consumables. | Moveable flow uses 1 batched issue-record fetch and 1 `bulkWrite` for completions. Consumable flow uses 1 `bulkWrite` for balances and 1 `insertMany` for transactions. | Refactored | Remaining per-missing-assignment `createRecord()` calls are kept for correctness and reference generation. |
| Transfer/assignment detail loaders | `server/src/controllers/assignment.controller.ts`, `server/src/services/assignmentSlip.service.ts`, `server/src/controllers/transfer.controller.ts` | Office assignment list: about 2 queries. Slip generation context: about 6-7 queries. Transfer approval risk profile: about 2 reads. Transfer notification/detail helpers: about 2-3 queries/event. | Office assignment list: 1 aggregate. Slip generation context: about 2-3 queries. Transfer approval risk profile: 1 aggregate read. Transfer notification/detail helpers unchanged. | Partially refactored | Assignment list, slip context, and transfer approval risk calculation were worth changing. Transfer lifecycle notifications are still fixed-query and not an N+1 source. |
| Report generation paths | `server/src/controllers/requisition.controller.ts`, `server/src/services/requisitionIssuanceReport.service.ts`, `server/src/controllers/report.controller.ts` | Requisition detail doc path: about 4 document queries after loading requisition. Issuance report: about 9-11 mostly constant bulk queries. Report controller already aggregate-based. | Requisition detail doc path: 1 line query + 1 linked-document aggregate. Issuance report: about 7-9 mostly constant bulk queries. Report controller unchanged. | Partially refactored | The detail view doc/version chain was collapsed, and issuance report issue-slip lookup/latest-version resolution now uses one aggregate instead of link plus document plus version reads. |
| Deep populate chains | `server/src/modules/records/services/record.service.ts`, `server/src/modules/records/services/recordDetail.service.ts` | Register listing: about 6 queries because of multiple populates. Record detail: about 6 queries across links, docs, versions, approvals, audit. | Register listing: 1 aggregate. Record detail: about 4 queries total. | Refactored | Replaced populate-heavy chains with lookup aggregates and grouped document/version loading. |

## Refactors Applied

1. Dashboard office scoping now uses aggregate-based asset summaries instead of `distinct()` chains.
2. Notification recipient resolution is bulk-preloaded by office and duplicate suppression is batch-based.
3. Maintenance and threshold workers build recipient maps once per run and send notifications through one bulk insert path.
4. Requisition fulfillment keeps the existing workflow but batches issue-record lookups, completion updates, consumable balance updates, and transaction inserts.
5. Assignment office listing is now a single aggregate instead of a preload-ids-then-query pattern.
6. Assignment slip context loading now joins assignment, requisition, requisition line, asset item, asset, and office in one aggregate before resolving the final target.
7. Requisition detail linked documents and latest versions are now loaded through one aggregate instead of separate link, document, and version queries.
8. Record register and record detail loaders no longer rely on deep populate chains.
9. Transfer approval risk calculation now aggregates asset values in one read instead of fetching asset items and assets separately.
10. Issuance report generation now resolves the linked issue-slip document and latest version through one aggregate before version creation.

## Benchmark Notes

- No runtime benchmarks were executed in this pass.
- No tests were run in this pass.
- Counts above are estimated from the pre-change and current code paths, not from Mongo profiler output.
- The most meaningful later benchmark targets are:
  - Office-scoped `GET /dashboard` and `GET /dashboard/data`
  - `GET /requisitions/:id`
  - Record register and record detail endpoints
  - Assignment handover/return slip generation endpoints
  - Requisition fulfillment on a seeded requisition with many moveable items and consumable lots
- The main improvements are reduction of round-trips and removal of large application-side ID fan-out, not behavioral rewrites.
- Deferred follow-up, if needed later:
  - add measured query-count assertions around the dashboard and record loaders
  - precompute dashboard/report summaries only after usage patterns justify the write-time complexity
  - revisit transfer detail helpers only if profiling shows them in the hot path
