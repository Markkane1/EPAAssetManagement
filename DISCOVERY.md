# DISCOVERY

Generated on: 2026-03-03
Source references: `server/src/docs/openapi.generated.ts`, `server/src/routes`, `server/src/modules/*/routes`, `client/src/App.tsx`, `server/src/models`, `server/src/config/env.ts`.

## 1. API ROUTES

Notes:
- This project exposes API routes under `/api` plus `/health`.
- Public endpoints are limited to auth login/reset, API docs, and health.
- All other endpoints require authentication (`requireAuth`), then enforce role/scope in controllers/middleware.
- Request/response schemas and parameter locations are captured in the generated OpenAPI spec.

| Method | Path | Auth | Request (high-level) | Success/Error |
|---|---|---|---|---|
| GET | `/api/activities` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/activities` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/activities/user/{userId}` | Yes | path:userId | 200, 400, 401, 403, 404, 500 |
| POST | `/api/approvals/{id}/decide` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/asset-items` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/asset-items` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/asset-items/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/asset-items/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/asset-items/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/asset-items/asset/{assetId}` | Yes | path:assetId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/asset-items/available` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/asset-items/batch` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/asset-items/location/{locationId}` | Yes | path:locationId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/assets` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/assets` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/assets/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/assets/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/assets/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/assets/category/{categoryId}` | Yes | path:categoryId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/assets/vendor/{vendorId}` | Yes | path:vendorId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/assignments` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/assignments` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/assignments/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/assignments/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/assignments/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/assignments/{id}/handover-slip.pdf` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/assignments/{id}/handover-slip/upload-signed` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| PUT | `/api/assignments/{id}/reassign` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/assignments/{id}/request-return` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/assignments/{id}/return-slip.pdf` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/assignments/{id}/return-slip/upload-signed` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/assignments/asset-item/{assetItemId}` | Yes | path:assetItemId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/assignments/employee/{employeeId}` | Yes | path:employeeId | 200, 400, 401, 403, 404, 500 |
| POST | `/api/auth/change-password` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/auth/forgot-password` | No | body | 200, 201, 400, 500 |
| POST | `/api/auth/login` | No | body | 200, 201, 400, 500 |
| POST | `/api/auth/logout` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/auth/me` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/auth/register` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/auth/reset-password` | No | body | 200, 201, 400, 500 |
| GET | `/api/categories` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/categories` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/categories/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/categories/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/categories/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/consumables/consumptions` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/consumables/containers` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/consumables/containers` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/consumables/containers/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/consumables/containers/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/consumables/containers/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/consumables/expiry` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/consumables/inventory/adjust` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/consumables/inventory/balance` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/consumables/inventory/balances` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/consumables/inventory/consume` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/consumables/inventory/dispose` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/consumables/inventory/opening-balance` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/consumables/inventory/receive` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/consumables/inventory/return` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/consumables/inventory/rollup` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/consumables/inventory/transfer` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/consumables/issues` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/consumables/items` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/consumables/items` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/consumables/items/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/consumables/items/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/consumables/items/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/consumables/ledger` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/consumables/lots` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/consumables/lots/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/consumables/reason-codes` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/consumables/reason-codes` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/consumables/returns` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/consumables/units` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/consumables/units` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/consumables/units/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/consumables/units/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/consumables/units/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/dashboard` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/dashboard/activity` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/dashboard/assets-by-category` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/dashboard/assets-by-status` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/dashboard/stats` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/districts` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/districts` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/districts/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/districts/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/districts/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/divisions` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/divisions` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/divisions/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/divisions/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/divisions/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/docs` | No | - | 200, 400, 500 |
| POST | `/api/document-links` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/documents` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/documents` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/documents/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/documents/{id}/upload` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/documents/versions/{versionId}/download` | Yes | path:versionId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/employees` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/employees` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/employees/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/employees/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/employees/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/employees/{id}/transfer` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/employees/directorate/{directorateId}` | Yes | path:directorateId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/maintenance` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/maintenance` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/maintenance/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/maintenance/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/maintenance/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/maintenance/{id}/complete` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/maintenance/asset-item/{assetItemId}` | Yes | path:assetItemId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/maintenance/scheduled` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/notifications` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/notifications/{id}/read` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/notifications/read-all` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/observability/metrics` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/office-sub-locations` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/office-sub-locations` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/office-sub-locations/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| PUT | `/api/office-sub-locations/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/offices` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/offices` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/offices/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/offices/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/offices/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/openapi.json` | No | - | 200, 400, 500 |
| GET | `/api/openapi.yaml` | No | - | 200, 400, 500 |
| GET | `/api/projects` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/projects` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/projects/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/projects/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/projects/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/projects/active` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/purchase-orders` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/purchase-orders` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/purchase-orders/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/purchase-orders/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/purchase-orders/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/purchase-orders/pending` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/purchase-orders/project/{projectId}` | Yes | path:projectId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/purchase-orders/vendor/{vendorId}` | Yes | path:vendorId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/records` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/records` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/records/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/records/{id}/approval-request` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/records/{id}/detail` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PATCH | `/api/records/{id}/status` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/records/register/issue` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/records/register/maintenance` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/records/register/transfer` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/reports/noncompliance` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/reports/requisitions` | Yes | - | 200, 400, 401, 403, 500 |
| GET | `/api/requisitions` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/requisitions` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/requisitions/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/requisitions/{id}/adjust` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/requisitions/{id}/fulfill` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/requisitions/{id}/issuance-report.pdf` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/requisitions/{id}/lines/{lineId}/map` | Yes | body; path:id; path:lineId | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/requisitions/{id}/upload-signed-issuance` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/requisitions/{id}/verify` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/return-requests` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/return-requests` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/return-requests/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/return-requests/{id}/receive` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/return-requests/{id}/return-receipt.pdf` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/return-requests/{id}/upload-signed-return` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/schemes` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/schemes` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/schemes/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/schemes/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/schemes/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/schemes/project/{projectId}` | Yes | path:projectId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/settings` | Yes | - | 200, 400, 401, 403, 500 |
| PUT | `/api/settings` | Yes | body | 200, 400, 401, 403, 500 |
| POST | `/api/settings/backup` | Yes | body | 200, 201, 400, 401, 403, 500 |
| POST | `/api/settings/test-email` | Yes | body | 200, 201, 400, 401, 403, 500 |
| GET | `/api/transfers` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/transfers` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/transfers/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/transfers/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| POST | `/api/transfers/{id}/approve` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/transfers/{id}/cancel` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/transfers/{id}/dispatch-to-dest` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/transfers/{id}/dispatch-to-store` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/transfers/{id}/receive-at-dest` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/transfers/{id}/receive-at-store` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| POST | `/api/transfers/{id}/reject` | Yes | body; path:id | 200, 201, 400, 401, 403, 404, 500 |
| GET | `/api/transfers/asset-item/{assetItemId}` | Yes | path:assetItemId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/transfers/office/{officeId}` | Yes | path:officeId | 200, 400, 401, 403, 404, 500 |
| GET | `/api/users` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/users` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/users/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| PUT | `/api/users/{id}/location` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/users/{id}/password` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/users/{id}/role` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/api/vendors` | Yes | - | 200, 400, 401, 403, 500 |
| POST | `/api/vendors` | Yes | body | 200, 201, 400, 401, 403, 500 |
| DELETE | `/api/vendors/{id}` | Yes | path:id | 200, 204, 400, 401, 403, 404, 500 |
| GET | `/api/vendors/{id}` | Yes | path:id | 200, 400, 401, 403, 404, 500 |
| PUT | `/api/vendors/{id}` | Yes | body; path:id | 200, 400, 401, 403, 404, 500 |
| GET | `/health` | No | - | 200, 400, 500 |

## 2. React Pages & Components

Primary routing file: `client/src/App.tsx`.

### Route surfaces
- Public: `/login`, `/forgot-password`.
- Protected core pages: dashboard, assets, asset-items, assignments/my-assets, transfers, maintenance, purchase-orders, offices, rooms-sections, categories, vendors, projects, schemes, reports, compliance, requisitions, returns, profile.
- Consumables pages: master, receive, containers, units, inventory, transfers, assignments, consume, adjustments, disposal, returns, ledger, expiry.
- Auth/system pages: settings, settings notifications, audit logs, user management/activity/permissions.

### Authorization in UI
- Uses `<ProtectedRoute>` with `page`, `anyOfPages`, and `allowedRoles`.
- Employee view is scoped to employee services and does not expose management-only pages by nav.
- Role/page checks use runtime permissions in `client/src/config/pagePermissions.ts` and auth context from `client/src/contexts/AuthContext.tsx`.

### Major layout/components
- Layout shell: `MainLayout`, `Sidebar`, `Header`.
- Auth context + route protection: `AuthProvider`, `ProtectedRoute`.
- Shared table/filter/report components: `DataTable`, report widgets, form modals for CRUD flows.

### API interaction pattern
- Client API wrapper: `client/src/lib/api.ts`.
- Uses `credentials: 'include'` cookie auth.
- Adds `x-csrf-token` for mutating requests when CSRF cookie is present.
- Normalizes Mongo-style ids and extracts validation errors for UI.

## 3. Mongoose Models

Model sources:
- Core models: `server/src/models/*.ts`
- Consumables models: `server/src/modules/consumables/models/*.ts`

Unique constraints found (high-impact):
- `user.email`
- `record.reference_no`
- `requisition.file_number`
- `store.code`
- `counter.key`
- `division.name`
- `district (name + division_id)`
- `office_sub_location (office_id + normalized name)`
- `assignment` active unique indexes for active assignment constraints
- `document_version (document_id + version_no)`
- `document_link (document_id + entity_type + entity_id)`
- `rate_limit_entry (key + window_start)`
- Consumables: unit code, reason-code composite keys, balance composites, container code

Top-level schema field inventory:

| Model file | Top-level schema fields |
|---|---|
| `server/src/models/activityLog.model.ts` | user_id, activity_type, description, metadata, ip_address, user_agent |
| `server/src/models/approvalRequest.model.ts` | record_id, requested_by_user_id, approver_user_id, approver_role, status, requested_at, decided_at, decision_notes |
| `server/src/models/asset.model.ts` | name, description, specification, category_id, vendor_id, purchase_order_id, project_id, asset_source, scheme_id, acquisition_date, unit_price, currency, quantity, attachment_file_name, attachment_mime_type, attachment_size_bytes, attachment_path, is_active |
| `server/src/models/assetItem.model.ts` | asset_id, holder_type, holder_id, serial_number, tag, assignment_status, item_status, item_condition, functional_status, item_source, purchase_date, warranty_expiry, notes, is_active |
| `server/src/models/assignment.model.ts` | asset_item_id, status, assigned_to_type, assigned_to_id, employee_id, requisition_id, requisition_line_id, handover_slip_document_id, handover_slip_generated_version_id, handover_slip_signed_version_id, return_slip_document_id, return_slip_generated_version_id, return_slip_signed_version_id, issued_by_user_id, issued_at, return_requested_by_user_id, return_requested_at, returned_by_user_id, returned_at, assigned_date, expected_return_date, returned_date, notes, is_active |
| `server/src/models/auditLog.model.ts` | actor_user_id, office_id, action, entity_type, entity_id, timestamp, diff |
| `server/src/models/category.model.ts` | name, description, scope, asset_type |
| `server/src/models/consumable.model.ts` | name, description, category_id, unit, total_quantity, available_quantity, acquisition_date, is_active |
| `server/src/models/counter.model.ts` | key, seq |
| `server/src/models/district.model.ts` | name, division_id, is_active |
| `server/src/models/division.model.ts` | name, is_active |
| `server/src/models/document.model.ts` | title, doc_type, status, office_id, created_by_user_id |
| `server/src/models/documentLink.model.ts` | document_id, entity_type, entity_id, required_for_status |
| `server/src/models/documentVersion.model.ts` | document_id, version_no, file_name, mime_type, size_bytes, storage_key, file_path, file_url, sha256, uploaded_by_user_id, uploaded_at |
| `server/src/models/employee.model.ts` | first_name, last_name, email, user_id, phone, job_title, hire_date, directorate_id, location_id, transferred_at, transferred_from_office_id, transferred_to_office_id, transfer_reason, is_active |
| `server/src/models/maintenanceRecord.model.ts` | asset_item_id, maintenance_type, maintenance_status, description, cost, performed_by, performed_by_vendor_id, estimate_document_id, scheduled_date, completed_date, notes, is_active |
| `server/src/models/notification.model.ts` | recipient_user_id, office_id, type, title, message, entity_type, entity_id, is_read |
| `server/src/models/office.model.ts` | name, code, division, district, address, contact_number, capabilities, parent_office_id, is_active |
| `server/src/models/officeSubLocation.model.ts` | office_id, name, is_active |
| `server/src/models/project.model.ts` | name, code, description, budget, is_active |
| `server/src/models/purchaseOrder.model.ts` | order_number, order_date, expected_delivery_date, delivered_date, source_type, source_name, total_amount, unit_price, tax_percentage, tax_amount, vendor_id, project_id, scheme_id, attachment_file_name, attachment_mime_type, attachment_size_bytes, attachment_path, status, notes |
| `server/src/models/rateLimitEntry.model.ts` | key, window_start, reset_at, expires_at, count |
| `server/src/models/record.model.ts` | record_type, reference_no, office_id, status, created_by_user_id, asset_item_id, employee_id, assignment_id, transfer_id, maintenance_record_id, notes |
| `server/src/models/requisition.model.ts` | file_number, office_id, issuing_office_id, requested_by_employee_id, target_type, linked_sub_location_id, submitted_by_user_id, fulfilled_by_user_id, record_id, signed_issuance_document_id, signed_issuance_uploaded_at, attachment_file_name, attachment_mime_type, attachment_size_bytes, attachment_path, status, remarks |
| `server/src/models/requisitionLine.model.ts` | requisition_id, line_type, asset_id, consumable_id, requested_name, mapped_name, mapped_by_user_id, mapped_at, requested_quantity, approved_quantity, fulfilled_quantity, status, notes |
| `server/src/models/returnRequest.model.ts` | employee_id, office_id, record_id, receipt_document_id, status |
| `server/src/models/scheme.model.ts` | project_id, name, description, is_active |
| `server/src/models/store.model.ts` | name, code, is_system, is_active |
| `server/src/models/systemSettings.model.ts` | organization, notifications, security, role_permissions, last_backup_at |
| `server/src/models/transfer.model.ts` | lines, from_office_id, to_office_id, store_id, transfer_date, handled_by, requisition_id, approval_order_document_id, handover_document_id, takeover_document_id, requested_by_user_id, approved_by_user_id, dispatched_by_user_id, received_by_user_id, dispatched_to_store_by_user_id, received_at_store_by_user_id, dispatched_to_dest_by_user_id, received_at_dest_by_user_id, rejected_by_user_id, cancelled_by_user_id, requested_at, approved_at, dispatched_to_store_at, received_at_store_at, dispatched_to_dest_at, received_at_dest_at, rejected_at, cancelled_at, status, notes, is_active |
| `server/src/models/user.model.ts` | email, password_hash, first_name, last_name, role, location_id, last_login_at, last_password_change_at, is_active, token_version, failed_login_attempts, lockout_until, password_reset_token_hash, password_reset_expires_at, password_reset_requested_at |
| `server/src/models/vendor.model.ts` | name, contact_info, email, phone, address, office_id |
| `server/src/modules/consumables/models/consumableBalance.model.ts` | holder_type, consumable_id, qty_in_total, qty_out_total, qty_on_hand, updated_at |
| `server/src/modules/consumables/models/consumableBalanceTxn.model.ts` | balance_id, event_type, quantity, issue_id, lot_id, consumption_id, performed_by_user_id, performed_at, notes |
| `server/src/modules/consumables/models/consumableConsumption.model.ts` | source_type, source_id, consumable_id, consumed_at, recorded_by_user_id, issue_id, lot_id, notes |
| `server/src/modules/consumables/models/consumableContainer.model.ts` | lot_id, container_code, initial_qty_base, current_qty_base, current_location_id, opened_date |
| `server/src/modules/consumables/models/consumableInventoryBalance.model.ts` | holder_type, holder_id, consumable_item_id, lot_id, qty_on_hand_base, qty_reserved_base |
| `server/src/modules/consumables/models/consumableInventoryTransaction.model.ts` | tx_time, created_by, from_holder_type, from_holder_id, to_holder_type, to_holder_id, consumable_item_id, lot_id, container_id, qty_base, entered_qty, entered_uom, reason_code_id, reference, notes, metadata |
| `server/src/modules/consumables/models/consumableIssue.model.ts` | lot_id, from_holder_type, from_holder_id, to_type, to_id, issued_by_user_id, issued_at, notes, document_id |
| `server/src/modules/consumables/models/consumableItem.model.ts` | name, cas_number, category_id, base_uom, is_hazardous, is_controlled, is_chemical, requires_lot_tracking, requires_container_tracking, default_min_stock, default_reorder_point, storage_condition, created_by |
| `server/src/modules/consumables/models/consumableLot.model.ts` | consumable_id, holder_type, batch_no, expiry_date, qty_received, qty_available, received_at, received_by_user_id, notes, document_id, source_type, vendor_id, project_id, scheme_id, handover_file_name, handover_mime_type, handover_size_bytes, handover_path, docs |
| `server/src/modules/consumables/models/consumableReasonCode.model.ts` | category, code, description |
| `server/src/modules/consumables/models/consumableReturn.model.ts` | mode, consumable_id, from_user_id, to_office_id, from_office_id, to_lot_id, performed_by_user_id, performed_at, notes |
| `server/src/modules/consumables/models/consumableUnit.model.ts` | code, name, group, to_base, aliases, is_active |

## 4. Authentication Surfaces

Backend auth implementation:
- JWT verification in `server/src/middleware/auth.ts`.
- Token accepted from `Authorization: Bearer <jwt>` OR `auth_token` cookie.
- JWT payload includes `userId`, `role`, `locationId`, `tokenVersion`; middleware rehydrates user from DB and enforces token version.
- Inactive/deleted users and stale token versions are rejected with 401.

Role restriction middleware:
- `requireAdmin` (`org_admin`)
- `requireRoles([...])`
- `requireOrgAdminOrCentralStoreCaretaker` for category/project/scheme central-store governance.

CSRF:
- `server/src/middleware/csrf.ts` enforces `x-csrf-token` against `csrf_token` cookie for non-safe methods when bearer token is not used.
- Applied on sensitive auth mutations (`register`, `change-password`, `logout`).

Frontend token/storage behavior:
- Auth token is cookie-based (httpOnly cookie set by backend).
- Frontend stores non-secret user profile object in `localStorage` (`user` key), not JWT.
- API calls include credentials (`credentials: 'include'`).

Role-restricted route groups (server):
- Auth register: admin only + CSRF.
- Settings update/read (except effective page permissions): admin only.
- Categories/Projects/Schemes: org_admin + central-store caretaker for create/update/list controls.
- Metrics endpoint: org_admin only (enforced in route handler).

## 5. External Dependencies / Services

No external SaaS integrations (Stripe/SendGrid/S3/etc.) detected in runtime code.
Main external libraries:
- Backend: Express, Mongoose, JWT, Helmet, CORS, Morgan, compression, Multer, Zod.
- Frontend: React, React Router, TanStack Query, Radix UI, Recharts, jsPDF, xlsx.
- Security tooling: eslint-plugin-security, retire, npm audit.

## 6. Environment Variables

| Env var | Purpose |
|---|---|
| `PORT` | API port |
| `MONGO_URI` | MongoDB connection string |
| `MONGO_MAX_POOL_SIZE` | Mongo max pool size |
| `MONGO_MIN_POOL_SIZE` | Mongo min pool size |
| `MONGO_MAX_IDLE_TIME_MS` | Mongo max idle time |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | Mongo server selection timeout |
| `MONGO_SOCKET_TIMEOUT_MS` | Mongo socket timeout |
| `MONGO_CONNECT_TIMEOUT_MS` | Mongo connect timeout |
| `MONGO_HEARTBEAT_FREQUENCY_MS` | Mongo heartbeat frequency |
| `MONGO_CONNECT_RETRIES` | Mongo initial connect retries |
| `MONGO_CONNECT_RETRY_DELAY_MS` | Delay between mongo connect retries |
| `MONGO_RETRY_WRITES` | Mongo retry writes toggle |
| `MONGO_RETRY_READS` | Mongo retry reads toggle |
| `MONGO_REQUIRE_REPLICA_SET` | Fail boot if not replica set/mongos |
| `JWT_SECRET` | JWT signing secret (>=32 chars) |
| `JWT_EXPIRES_IN` | JWT TTL |
| `JWT_INVALIDATE_BEFORE` | Global JWT invalidate cutoff (unix seconds) |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | Reset token lifetime |
| `AUTH_LOCKOUT_THRESHOLD` | Failed login attempts before lockout |
| `AUTH_LOCKOUT_BASE_MINUTES` | Base lockout duration |
| `AUTH_LOCKOUT_MAX_MINUTES` | Max lockout duration |
| `TRUST_PROXY` | Express trust proxy setting |
| `COMPRESSION_THRESHOLD_BYTES` | Response size threshold for compression |
| `COMPRESSION_LEVEL` | gzip compression level |
| `HTTP_JSON_LIMIT` | Max JSON payload size |
| `HTTP_URLENCODED_LIMIT` | Max URL-encoded payload size |
| `CACHE_REFERENCE_MAX_AGE_SECONDS` | Reference cache max-age |
| `CACHE_REFERENCE_STALE_WHILE_REVALIDATE_SECONDS` | Reference cache SWR |
| `RATE_LIMIT_BACKEND` | Rate limiter storage backend (mongo/memory) |
| `CORS_ORIGIN` | Allowed origins CSV |
| `SEED_SUPER_ADMIN` | Enable bootstrap super admin seed |
| `SUPER_ADMIN_EMAIL` | Bootstrap super admin email |
| `SUPER_ADMIN_PASSWORD` | Bootstrap super admin password |
| `VITE_API_BASE_URL` | Client API base URL |

## 7. Unfinished / Risky Code

- `server/src/controllers/dashboard.controller.ts:249` contains a TODO comment (`implement properly later`) in dashboard logic.
- Dependency risk remains from `npm audit` (High):
  - `rollup` (transitive via Vite) advisory open in current resolved tree.
  - `xlsx` (direct dependency) advisories open with no fix currently available from npm audit.
- `xss-clean` package integration required a compatibility wrapper in Express 5 (`server/src/app.ts`) because direct middleware mutation of `req.query` is incompatible.
- Runtime security tests currently exist in `server/tests/security/security-runtime-tests.ts`; they cover auth bypass, CSRF, role escalation, IDOR-like scope checks, upload spoofing, and rate limiting, but do not yet cover every endpoint automatically.

## Session Status

- Discovery output completed and saved.
- Detailed security findings and remediation status are recorded in `SECURITY_AUDIT.md`.
