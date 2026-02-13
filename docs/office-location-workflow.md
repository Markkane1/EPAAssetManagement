# Office and Location Workflow

## Purpose
This document defines:
- The current office/location behavior in the system.
- The target workflow to separate **Office** (administrative unit) and **Location** (physical inventory site).
- A practical rollout and migration checklist to implement the change without breaking existing flows.

## Current State (As Implemented)

### 1. Data model today
- Backend has a single entity: `Office` (`server/src/models/office.model.ts`).
- Most modules store physical placement in fields named `location_id`, but those IDs point to `Office`.
- Client aliases `Location = Office` (`client/src/types/index.ts`), so UI mixes both terms.

### 2. Auth scope today
- Every user has one `location_id` in `User` (`server/src/models/user.model.ts`).
- Request context resolves `locationId` and `isHeadoffice` (`server/src/middleware/auth.ts`).
- `super_admin` is always global.
- `admin` or `headoffice_admin` becomes global only when assigned office has `is_headoffice = true`.
- `location_admin` is office-scoped.

### 3. Current functional flow
1. Superadmin/admin creates offices.
2. Admin assigns user `location_id` to one office record.
3. Asset items, transfers, maintenance, records, and consumables use that office ID as the operational location scope.
4. Head-office flag on office record controls global access behavior for admin-class users.

### 4. Current pain points
- Terminology drift: office and location are used interchangeably.
- Single-user location assignment limits multi-site access patterns.
- Head-office logic depends on office assignment, not explicit organizational permission.
- Hard to evolve hierarchy (HQ -> regional office -> site/lab/store) cleanly.

---

## Target Model (To Be Implemented)

### 1. Domain separation
- `Office`: administrative/business unit (HQ, Regional, Directorate Office).
- `Location`: physical operational node (warehouse, lab, floor, room, sub-store).
- `Office` can own many `Location` records.
- Users are assigned access by office/location through explicit access records.

### 2. Proposed entities
- `offices`
  - `id`, `name`, `code`, `office_type` (`HQ`, `REGIONAL`, `DIRECTORATE`, `FIELD`)
  - `parent_office_id`, `is_active`
- `locations`
  - `id`, `office_id`, `name`, `location_type` (`CENTRAL`, `LAB`, `SUBSTORE`, `ROOM`)
  - `parent_location_id`, `address`, `capabilities`, `is_active`
- `user_office_access`
  - `user_id`, `office_id`, `access_level` (`owner`, `admin`, `operator`, `viewer`)
- `user_location_access`
  - `user_id`, `location_id`, `access_level` (`admin`, `operator`, `viewer`)

### 3. Core authorization rules
- `super_admin`: global on all offices and locations.
- `admin`: office-admin on assigned offices; global only if explicit global flag is granted.
- `location_admin`: admin/operator on assigned locations only.
- `user`/`employee`/`viewer`: scoped to assigned locations (read/operate per module permissions).
- Head-office is represented by `office_type = HQ`, not by implied role behavior.

### 4. Lab-capable location rules
- Lab operations run only on locations where chemical capability is enabled.
- In current code, chemical capability resolves from:
  - `capabilities.chemicals` if explicitly set, otherwise
  - fallback `type === LAB` (except head office).
- Lab permissions should be tied to location scope, not office name patterns.

---

## Complete Target Workflow

### 1. Organization setup workflow
1. Superadmin creates HQ office.
2. Superadmin creates regional/directorate offices and links `parent_office_id`.
3. Admin creates physical locations under each office.
4. Admin configures location capabilities (`moveables`, `consumables`, `chemicals`).

### 2. Access provisioning workflow
1. Create user account.
2. Assign office-level access in `user_office_access`.
3. Assign location-level access in `user_location_access` (one or many).
4. Effective permission = role baseline + explicit office/location grants.
5. If no scoped assignment exists, deny operational actions.

### 3. Daily operations workflow
1. User signs in.
2. Backend resolves:
   - role baseline
   - allowed offices
   - allowed locations
3. All module queries apply location filters using resolved access set.
4. Write operations validate target location belongs to caller's allowed set.
5. Cross-location operations (transfers) require source and destination permission checks.

### 4. Office/location lifecycle workflow
1. Create office -> optional parent office -> activate.
2. Create location under office -> set capabilities -> activate.
3. Re-parent location (if office realignment occurs) via controlled migration action.
4. Deactivate location only when:
   - no active inventory conflicts, or
   - transfer plan completes.
5. Deactivate office only when all child locations are deactivated or reassigned.

### 5. Asset and consumables workflow
- Movable assets:
  - `asset_items.location_id` always references `locations.id` (not offices).
  - Transfers move between locations.
- Consumables:
  - Inventory balance and transactions reference `locations.id`.
  - Capability checks (`chemicals`, etc.) read location capabilities only.

### 6. Records and approvals workflow
1. Record stores both:
   - `office_id` (administrative ownership)
   - `location_id` (operational origin)
2. Approval routing can use office chain (directorate/regional/HQ) while preserving location traceability.

---

## Lab Workflow and Permissions

### 1. Lab setup workflow
1. Admin or central store admin creates/updates a location with `location_type = LAB`.
2. Enable `capabilities.chemicals = true` for chemical inventory locations.
3. Assign lab users (`lab_manager`, `lab_user`) to that lab location.
4. Configure lot/container policy for controlled and chemical items.

### 2. Lab inventory workflow
1. Central store receives stock into `CENTRAL` location.
2. Central store transfers stock to lab locations.
3. Lab manager (or location admin) performs lab-to-lab transfers where permitted.
4. Lab user/lab manager consumes stock at assigned lab location.
5. Lab manager handles adjustments, disposals, and returns to central.
6. Reports/ledger/expiry are reviewed by allowed reporting roles.

### 3. Chemical safety and integrity workflow
1. On receive/transfer/consume/adjust/dispose/return, backend validates chemical-capable location.
2. Controlled/container-tracked items require container-aware operations.
3. FEFO lot selection is used when lot is not explicitly provided.
4. Negative stock override requires elevated permission and explicit override note.

### 4. Lab permission matrix (effective behavior)
| Role | Scope | Master Data (items/suppliers/lots/units) | Consumable Locations CRUD | Receive to Central | Transfer from Central | Lab-to-Lab Transfer | Consume | Adjust | Dispose | Return to Central | Opening Balance | Reports/Ledger/Expiry | Negative Override |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `super_admin` | Global | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `admin` | Global | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `central_store_admin` | Assigned location(s) | Yes | Yes | Yes | Yes | No | No | Yes | No | No | No | Yes | No |
| `lab_manager` | Assigned lab location(s) | No | No | No | No | Yes | Yes | Yes | Yes | Yes | No | Yes | No |
| `location_admin` | Assigned location(s) | No | No | No | No | Yes | Yes | Yes | Yes | Yes | No | Yes | No |
| `lab_user` | Assigned lab location(s) | No | No | No | No | No | Yes | No | No | No | No | Yes | No |
| `user` / `employee` / `directorate_head` | Assigned location(s) | No | No | No | No | No | Yes | No | No | No | No | Yes | No |
| `auditor` / `viewer` | Global read | No | No | No | No | No | No | No | No | No | No | Yes | No |

### 5. Enforcement notes (current backend)
- Route-level guards allow `central_store_admin` to manage consumable locations.
- Service-level permission object does not currently set `canManageLocations` for `central_store_admin`.
- Inventory service enforces location scope for non-global roles using assigned user location.
- `auditor` and `viewer` are global read for reports/ledger/balances, with no write operations.

---

## Role-Based Workflow (Target)

### 1. Superadmin workflow
1. Define organization hierarchy (HQ -> regional/directorate offices).
2. Create and activate locations under offices.
3. Configure capability policy templates for location types.
4. Grant/revoke office-level and location-level access for admins.
5. Monitor cross-office operations and audit logs.
6. Approve exceptional actions (global overrides, structural re-parenting).

### 2. Admin workflow
1. Manage offices and locations within granted office scope.
2. Provision users and assign scoped office/location access.
3. Validate location capability alignment with module usage.
4. Supervise transfers and maintenance across assigned offices.
5. Escalate structural or global actions to superadmin.

### 3. Location admin workflow
1. Operate day-to-day inventory at assigned locations.
2. Create and process local assignments/transfers/maintenance actions.
3. Maintain location-level operational data quality.
4. Raise cross-location requests outside owned scope.

### 4. User workflow
1. Access only assigned location data.
2. Execute permitted operational actions (consume/use/submit requests).
3. Track own tasks/history and submit approval-required actions.
4. Cannot change office/location structure or access mappings.

### 5. Central store admin workflow
1. Manage consumables master data and central inventory setup.
2. Receive stock into central location and dispatch to labs.
3. Monitor central stock health and reporting.
4. Cannot execute lab-only operations unless explicitly granted.

### 6. Lab manager workflow
1. Operate assigned lab inventory.
2. Perform consumption, adjustments, disposal, returns, and lab transfers.
3. Enforce lab SOP and transaction quality for lot/container records.
4. Escalate central procurement/receiving actions to central store admin.

### 7. Lab user workflow
1. Consume inventory from assigned lab location.
2. View stock/reports for assigned scope.
3. Submit replenishment and exception requests to lab manager.
4. No master-data or stock-adjustment authority.

---

## API Workflow Changes

### 1. New/updated endpoints
- Offices
  - `GET /offices`
  - `POST /offices`
  - `PUT /offices/:id`
- Locations
  - `GET /locations?officeId=...`
  - `POST /locations`
  - `PUT /locations/:id`
  - `POST /locations/:id/reparent`
- Access
  - `POST /users/:id/office-access`
  - `POST /users/:id/location-access`
  - `GET /users/:id/access`

### 2. Backward compatibility stage
- Keep `/offices` response stable for existing screens.
- Add compatibility map in server:
  - old `location_id` requests resolve to `locations.id`.
  - old office-only consumers receive derived default location only during transition.
- Remove compatibility layer after all client paths are migrated.

---

## Migration Workflow (No-Downtime Plan)

### Phase 1: Schema introduction
1. Add `locations` and access tables/collections.
2. Add `location_id_new` fields where needed (temporary).
3. Keep old office-based references intact.

### Phase 2: Backfill
1. For each existing office, create default primary location.
2. Backfill operational references:
   - `asset_items.location_id_new`
   - transfer source/destination location IDs
   - consumable inventory location IDs
3. Backfill user location access from existing `users.location_id`.

### Phase 3: Dual-write
1. Write both old and new fields on create/update.
2. Read path prefers new location model with fallback to old.
3. Monitor mismatch logs.

### Phase 4: Cutover
1. Switch reads fully to new location model.
2. Remove old office-as-location assumptions from controllers/services.
3. Drop deprecated fields and compatibility code.

---

## Execution Checklist

### A. Data and backend
- [ ] Introduce `locations` model and repository.
- [ ] Introduce user office/location access mappings.
- [ ] Refactor auth context resolver to return allowed office/location sets.
- [ ] Refactor scope helpers (`buildOfficeFilter` equivalents) to location filters.
- [ ] Update modules (assets, transfers, maintenance, records, consumables) to enforce location-based scope.
- [ ] Add migration scripts for backfill and validation.

### B. API and contracts
- [ ] Add `/locations` endpoints and validation schemas.
- [ ] Update API docs for office vs location semantics.
- [ ] Add compatibility translation for legacy payload fields.
- [ ] Add deprecation warnings in logs for old field usage.

### C. Client
- [ ] Split office management and location management UIs.
- [ ] Replace `Location = Office` type alias with real separate types.
- [ ] Update forms/selectors to use location lists where operational context is needed.
- [ ] Add office/location access assignment UI in user management.

### D. Security and correctness
- [ ] Add authorization tests for multi-location users.
- [ ] Add negative tests for unauthorized cross-location writes.
- [ ] Add audit log entries for access grant/revoke and re-parent operations.

### E. Rollout safety
- [ ] Feature flag for new location model by module.
- [ ] Metrics dashboard for scope-denied errors and data mismatch.
- [ ] Rollback plan for each phase (schema, dual-write, cutover).

---

## Acceptance Criteria
- Office and location are distinct in model, API, UI, and permissions.
- No module uses office ID as physical stock location.
- User permissions support one-to-many location access.
- HQ/global access is explicit and auditable.
- Existing operations continue to work through migration window.

---

## Source Pointers (Current Implementation)
- `server/src/models/office.model.ts`
- `server/src/middleware/auth.ts`
- `server/src/utils/accessControl.ts`
- `server/src/utils/scope.ts`
- `server/src/controllers/office.controller.ts`
- `server/src/controllers/user.controller.ts`
- `server/src/modules/consumables/utils/permissions.ts`
- `server/src/modules/consumables/utils/officeCapabilities.ts`
- `server/src/modules/consumables/services/inventory.service.ts`
- `server/src/modules/consumables/routes/index.ts`
- `client/src/types/index.ts`
- `client/src/services/officeService.ts`
- `client/src/services/locationService.ts`
- `client/src/lib/locationUtils.ts`
