## [BUG-001] Placeholder "View Details" actions in Projects do not open a real record
- **Severity:**    Low
- **File:**        client/src/pages/Projects.tsx:116
- **Session:**     Vibe Audit
- **Description:** The Projects page exposed a fake `View Details` action. It now opens a real details dialog backed by `useProject`.
- **Test:**        tests/components/Projects.test.tsx
- **Status:**      Resolved

## [BUG-002] Placeholder "View Details" action in Vendors does not open a real record
- **Severity:**    Low
- **File:**        client/src/pages/Vendors.tsx:108
- **Session:**     Vibe Audit
- **Description:** The Vendors page exposed a fake `View Details` action. It now opens a real details dialog backed by `useVendor`.
- **Test:**        tests/components/Vendors.test.tsx
- **Status:**      Resolved

## [BUG-003] Employee dashboard fires unauthorized admin queries in the background
- **Severity:**    Medium
- **File:**        client/src/pages/Dashboard.tsx:57
- **Session:**     Vibe Audit
- **Description:** The dashboard mounted admin-oriented hooks and employee-scoped return/assignment queries before the employee context was fully resolved, which leaked `403 Forbidden` API failures into the browser console.
- **Test:**        tests/e2e/console-hygiene.spec.ts and source inspection
- **Status:**      Resolved

## [BUG-004] Global header notification fetch leaks 401 errors into the browser console
- **Severity:**    Low
- **File:**        client/src/components/layout/Header.tsx:76
- **Session:**     Vibe Audit
- **Description:** The shared header mounted notifications while auth state was still settling, which produced transient `401 Unauthorized` network noise in the browser console.
- **Test:**        tests/e2e/console-hygiene.spec.ts
- **Status:**      Resolved
