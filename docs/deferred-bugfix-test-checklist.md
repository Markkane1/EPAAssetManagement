# Deferred Bugfix Test Checklist

Do not run these until explicitly approved.

1. Dashboard authorization and correctness
   Command: `npm run test:integration -- --runInBand`
   Focus:
   - Non-admin recent activity only returns office-scoped assignments, maintenance records, and assets
   - Non-admin dashboard low-stock count only reflects the assigned office
   - Admin dashboard still returns recent activity and low-stock stats without access regression

2. Notification dedupe and recipient fan-out
   Command: `npm run test:unit -- tests/unit/notification-service.test.ts`
   Focus:
   - Recipient resolution performs one bulk user query for many offices
   - Office recipient maps include org admins, office roles, explicit users, and exclusions correctly
   - Bulk notification creation suppresses recent duplicates without one `exists()` query per row
   - Duplicate rows within the same payload do not produce duplicate inserts

3. Maintenance reminder worker grouping
   Command: `npm run test:integration -- --runInBand`
   Focus:
   - Multiple due records in the same office resolve recipients once per office
   - Due and overdue maintenance notifications still generate the expected payloads

4. Client auth bootstrap and session-state sanity
   Command: `npm run test:components -- tests/components/AuthContext.test.tsx`
   Focus:
   - `/auth/me` transient failure does not force logout
   - Confirmed `401/403` still clears local auth state
   - No helper path treats raw `localStorage` presence as authoritative auth truth

5. Client audit log privacy
   Command: `npm run test:unit -- tests/unit/client-lib-utils.test.ts`
   Focus:
   - Audit logs are not persisted in `localStorage`
   - Audit logs are cleared on logout
   - Export helpers still work for the current in-memory session state

6. Requisition fulfillment batching
   Command: `npm run test:unit -- tests/unit/requisition-controller.test.ts`
   Focus:
   - Fulfillment still creates assignments and issue records correctly
   - Existing issue records are updated without per-assignment existence lookups
   - Consumable issuance still creates transactions with correct quantities

7. Security and regression sweep for touched areas
   Command: `npm run test:security`
   Focus:
   - Request sanitization and auth flows remain stable
   - No access-control regression on dashboard or requisition paths

8. Full repo validation
   Command: `npm run test:all`
   Focus:
   - Run only after steps 1 through 7 are approved and pass

9. Record and requisition detail performance regression
   Command: `npm run test:integration -- --runInBand`
   Focus:
   - Record register still returns related asset, employee, assignment, transfer, and maintenance data correctly after aggregate loading
   - Record detail still returns documents, versions, approvals, and audit history correctly after aggregate loading
   - Requisition detail still returns requisition form and issue slip latest-version metadata correctly

10. Assignment loader performance regression
   Command: `npm run test:integration -- --runInBand`
   Focus:
   - Office assignment list still returns only office-scoped assignments after aggregate filtering
   - Handover and return slip generation still resolve the same requisition, asset, office, and target labels after aggregate context loading

11. Performance smoke run on seeded data
   Command: `npm run test:all`
   Focus:
   - Execute only after steps 1 through 10 are approved
   - Compare dashboard, requisition detail, record detail, and assignment slip response times before/after on the same seed set
