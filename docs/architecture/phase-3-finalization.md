# Phase 3 Architecture Finalization

Date: 2026-02-17  
Scope: Reports, Audit Depth, Notifications

## 1) Reports Architecture (Finalized)

### Decision
Move report generation to a server-first model for canonical, role-scoped, and auditable outputs.  
Client-side exports can remain as convenience views, but official reports must come from API-backed datasets.

### Report Families

1. Operational Inventory Reports
   1. Office/Lab/Directorate dated inventory snapshot (category-wise, item-wise, holder-wise)
   2. Movable assigned report (employee/section/office scoped)
   3. Consumable assigned balance report (employee/section/office scoped)
   4. Consumables consumed report (office-wise and central-wise)

2. Traceability Reports
   1. Individual movable asset lifecycle report
   2. Movable lot lifecycle report
   3. Assignment trace report (request to issue to return)

3. Governance & Compliance Reports
   1. Requisition SLA and aging report
   2. Return request aging and pending signature report
   3. Non-compliance report (missing required document/status mismatch)

4. Analytics Reports
   1. Consumption trend report (periodic)
   2. Transfer velocity report (inter-office movement)
   3. Category utilization report (movable vs consumable)

### Priority

1. P0
   1. Inventory snapshot
   2. Movable assigned
   3. Consumable assigned balance
   4. Consumables consumed (office and central)
   5. Individual movable lifecycle
2. P1
   1. Lot lifecycle
   2. Assignment trace
   3. Requisition SLA/aging
   4. Return aging
3. P2
   1. Trend/velocity/utilization analytics

### Required Filters (standardized across reports)

1. Date range (required)
2. Office type
3. Office
4. Category
5. Asset mode (moveable/consumable/chemicals)
6. Holder type
7. Holder
8. Item/asset search
9. Output format (JSON/CSV/PDF)

### Output Standard

1. Every report response includes:
   1. `generated_at`
   2. `generated_by`
   3. `filters`
   4. `summary`
   5. `rows`
2. PDF exports include:
   1. report title
   2. filter summary
   3. page number
   4. system timestamp

## 2) Audit Architecture (Finalized)

### Decision
Use a unified audit-event contract across modules, with immutable append-only events and actor/scope metadata.

### Canonical Audit Event Contract

1. Event identity
   1. `event_id`
   2. `event_type`
   3. `occurred_at`
2. Actor context
   1. `actor_user_id`
   2. `actor_role`
   3. `actor_office_id`
3. Target context
   1. `entity_type`
   2. `entity_id`
   3. `office_id`
4. Action context
   1. `action`
   2. `status` (success/failure)
   3. `reason` (for failure/reject cases)
5. Change context
   1. `before` (redacted)
   2. `after` (redacted)
   3. `changed_fields`
6. Request context
   1. `request_id`
   2. `ip_address`
   3. `user_agent`

### Mandatory Audit Coverage

1. Authentication and authorization events
2. Office/division/district CRUD and relation changes
3. Employee and section CRUD
4. Asset and consumable receiving/transfer/assignment/consumption/disposal
5. Requisition and return workflow transitions
6. Purchase order create/update/status change
7. Document upload/signature actions
8. Report generation events (with filters and report type)

### Retention

1. Hot retention: 180 days query-optimized
2. Archive retention: 7 years immutable storage
3. PII-minimized snapshots in `before/after`

## 3) Notification Architecture (Finalized)

### Decision
Keep in-app notifications as baseline; define event matrix now so optional channels (email/SMS) can be added without model changes.

### Notification Event Matrix (P0)

1. Requisition submitted
   1. Recipients: office head, caretaker
2. Requisition verified/rejected
   1. Recipients: requester, target employee/section owner
3. Requisition fulfillment completed / pending signature
   1. Recipients: requester, target, office head
4. Assignment draft created
   1. Recipients: assignee, caretaker
5. Signed handover uploaded
   1. Recipients: assignee, office head
6. Return requested
   1. Recipients: caretaker, office head
7. Signed return uploaded / return closed
   1. Recipients: requester, assignee
8. Consumable lot received
   1. Recipients: caretaker, location head
9. Consumable transfer completed
   1. Recipients: source and destination heads
10. Low stock threshold crossed
   1. Recipients: caretaker, office head
11. Expiry warning windows (30/15/7 days)
   1. Recipients: caretaker, relevant location head

### Notification Event Matrix (P1)

1. Purchase order created/updated/approved/received
2. Compliance issue created/resolved
3. Audit anomaly alerts (high-risk failures)

### Delivery Rules

1. Deduplication key
   1. `type + entity_type + entity_id + recipient + day`
2. Priority levels
   1. `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
3. Read model
   1. per-user read state
4. Escalation
   1. unresolved high-priority notices after SLA interval

## 4) API Contract Additions (Finalized Direction)

### Reports

1. `GET /api/reports/inventory-snapshot`
2. `GET /api/reports/moveable-assigned`
3. `GET /api/reports/consumable-assigned`
4. `GET /api/reports/consumable-consumption`
5. `GET /api/reports/moveable-lifecycle/:assetItemId`
6. `GET /api/reports/lot-lifecycle/:lotId`
7. `GET /api/reports/assignment-trace/:assignmentId`

### Audit

1. `GET /api/audit/events`
2. `GET /api/audit/events/:id`
3. `GET /api/audit/summary`

### Notifications

1. `GET /api/notifications`
2. `POST /api/notifications/:id/read`
3. `POST /api/notifications/read-all`
4. `POST /api/notifications/test-dispatch` (admin only, non-production)

## 5) Implementation Sequence

1. P0 reports API endpoints and server-side query services
2. Unified audit event writer utility and module adoption
3. Notification matrix expansion + dedupe + priority
4. Frontend report pages migrated from local composition to API-driven
5. OpenAPI update and endpoint-level tests

