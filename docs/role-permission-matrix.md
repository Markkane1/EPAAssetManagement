# Role & Permission Matrix

This report summarizes **backend-enforced permissions** and **frontend UI gating** in the current codebase.

## Legend
- **G** = Global (all offices)
- **O** = Office-scoped (user's assigned office)
- **R** = Read-only
- **C/U/D** = Create / Update / Delete
- **Ops** = Operational actions (assign/transfer/consume/etc.)
- **Head Office Admin** = `super_admin` OR (`admin`/`headoffice_admin` assigned to a head office)

## Role Catalog & Scope Logic
| Role | Scope logic | Notes |
|---|---|---|
| super_admin | G | Full system access |
| admin | G if at head office, else O | Becomes Head Office Admin when office.is_headoffice=true |
| headoffice_admin | G if at head office, else O | Backend role used for head office scoping |
| manager | normalized to admin | Treated as admin |
| location_admin | O | Treated as office manager |
| office_head | O | Treated as office manager |
| central_store_admin | O (Consumables central) | Consumables central ops |
| lab_manager | O (lab) | Consumables lab ops |
| lab_user | O (lab) | Consumables lab consume + reports |
| auditor | O/G | Consumables reports only |
| viewer | O/G | Consumables reports only |
| user | O | General user, limited ops |
| employee | O | General employee, limited ops |
| directorate_head | O | Directorate-scoped in legacy consumable assignment |

---

## Backend Permissions (Enforced Server-Side)

### Users & Auth
| Role | Users list | Create user | Update role | Update location | Reset password | Delete user |
|---|---|---|---|---|---|---|
| super_admin | G | G | G (incl. super_admin) | G | G | G |
| admin | G (excluding super_admin) | G (not super_admin) | G (not super_admin) | G (not super_admin) | G (not super_admin) | G (not super_admin) |
| others | ? | ? | ? | ? | ? | ? |

### Divisions & Districts
| Role | List | Create | Update | Delete |
|---|---|---|---|---|
| super_admin | G | G | G | G |
| others | R | ? | ? | ? |

### Employees
| Role | List | Create | Update | Remove/Deactivate |
|---|---|---|---|---|
| super_admin | G | G | G | G |
| admin (head office) | G | G | G | G |
| admin (not head office) | O | O | O | O |
| location_admin | O | O | O | O |
| others | O/R only (if scoped) | ? | ? | ? |

### Assets (Master Definitions)
| Role | List | Create | Update | Retire |
|---|---|---|---|---|
| Head Office Admin | G | G | G | G |
| Others | O (only assets with items in office) | ? | ? | ? |

### Asset Items
| Role | List | Create | Update | Retire |
|---|---|---|---|---|
| Head Office Admin | G | G | G | G |
| location_admin / office_head | O | ? | O (no location change) | O |
| others | O/R | ? | ? | ? |

### Assignments
| Role | List | Create | Update | Return/Reassign | Remove |
|---|---|---|---|---|---|
| Head Office Admin | G | G | G | G | G |
| location_admin / office_head | O | O | O | O | O |
| others | O/R | ? | ? | ? | ? |

### Transfers (Moveable Assets)
| Role | List | Create | Update status | Remove |
|---|---|---|---|---|
| Head Office Admin | G | G | G | G |
| location_admin / office_head | O (from/to own office) | O | O | ? |
| others | O/R | ? | ? | ? |

### Maintenance
| Role | List | Create | Update | Complete | Remove |
|---|---|---|---|---|---|
| Head Office Admin | G | G | G | G | G |
| location_admin / office_head | O | O | O | O | O |
| others | O/R | ? | ? | ? | ? |

### Records + Documents + Approvals
| Role | Access |
|---|---|
| Head Office Admin | G |
| Others | O (office-scoped by context) |
| Approvals | Only approver user/role can decide; headoffice admin bypasses |

---

## Consumables (New Inventory Module)
Permissions are defined in `server/src/modules/consumables/utils/permissions.ts`.

| Role | Manage items/units/suppliers/lots/locations | Receive Central | Transfer Central | Transfer Lab | Consume | Adjust | Dispose | Return | Opening Balance | View Reports | Override Negative |
|---|---|---|---|---|---|---|---|---|---|---|---|
| super_admin/admin | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| central_store_admin | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| lab_manager / location_admin | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| lab_user / user / employee / directorate_head | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| auditor / viewer | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |

---

## Legacy Consumables (Old Module)
| Role | Assignment create/remove | Assignment list | Transfer batch | Consumption |
|---|---|---|---|---|
| location_admin | ? | O | ? (from own office only) | ? |
| directorate_head | ? (employees in directorate only) | O | ? | ? |
| others | ? (unless restricted) | O/G | ? | ? |

---

## Frontend UI Gating (Client-Only)
- Route protection uses `ProtectedRoute` + `allowedRoles` in `src/App.tsx`.
- Sidebar visibility uses `allowedRoles` in `src/components/layout/Sidebar.tsx`.
- The **User Permissions** page is mock-only and does not enforce backend permission changes.

---

## Public (Unauthenticated) Routes
The following routes currently **do not** require `requireAuth` (public):
- Offices (`server/src/routes/office.routes.ts`)
- Categories (`server/src/routes/category.routes.ts`)
- Vendors (`server/src/routes/vendor.routes.ts`)
- Projects (`server/src/routes/project.routes.ts`)
- Schemes (`server/src/routes/scheme.routes.ts`)
- Purchase Orders (`server/src/routes/purchaseOrder.routes.ts`)

If you want these locked down, I can add backend auth guards.
