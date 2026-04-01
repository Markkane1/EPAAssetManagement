import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/src/models/systemSettings.model", () => ({
  SystemSettingsModel: {
    findOne: vi.fn(),
  },
}));

import { SystemSettingsModel } from "../../server/src/models/systemSettings.model";
import {
  assertKnownRole,
  buildUserRoleMatchFilter,
  expandRoleCapabilities,
  hasRoleCapability,
  isKnownRole,
  normalizeRole,
  normalizeRoles,
  resolveActiveRole,
  resolveRuntimeRole,
} from "../../server/src/utils/roles";
import {
  hasPermissionAction,
  loadStoredRolePermissionsContext,
  resolveStoredRolePageActions,
  resolveStoredRolePermissionEntry,
} from "../../server/src/utils/rolePermissions";

describe("role normalization helpers", () => {
  it("should normalize canonical and legacy roles for typical input", () => {
    expect(normalizeRole("org_admin")).toBe("org_admin");
    expect(normalizeRole("admin")).toBe("org_admin");
    expect(normalizeRole("store_keeper")).toBe("storekeeper");
  });

  it("should return false from isKnownRole for empty and unknown values", () => {
    expect(isKnownRole("")).toBe(false);
    expect(isKnownRole(null)).toBe(false);
    expect(isKnownRole("totally_unknown")).toBe(false);
  });

  it("should throw from normalizeRole and assertKnownRole for invalid roles", () => {
    expect(() => normalizeRole("bad-role")).toThrowError(/invalid role/i);
    expect(() => assertKnownRole(undefined)).toThrowError(/invalid role/i);
  });

  it("should normalize role arrays, deduplicate them, and fall back to employee when empty", () => {
    expect(normalizeRoles(["admin", "org_admin", "employee"])).toEqual([
      "org_admin",
      "employee",
    ]);
    expect(normalizeRoles([], null)).toEqual(["employee"]);
    expect(normalizeRoles([], null, { allowEmpty: true })).toEqual([]);
  });

  it("should resolve the active role only when the desired role is available", () => {
    expect(resolveActiveRole("office_head", ["office_head", "employee"])).toBe(
      "office_head"
    );
    expect(resolveActiveRole("org_admin", ["employee", "caretaker"])).toBe(
      "employee"
    );
    expect(resolveActiveRole(undefined, [])).toBe("employee");
  });

  it("should resolve runtime roles and expand capabilities for elevated operational roles", () => {
    expect(resolveRuntimeRole("storekeeper")).toBe("caretaker");
    expect(resolveRuntimeRole("inventory_controller")).toBe("caretaker");
    expect(expandRoleCapabilities(["storekeeper"]).sort()).toEqual(
      ["storekeeper", "caretaker"].sort()
    );
  });

  it("should match role capabilities against required roles", () => {
    expect(hasRoleCapability(["storekeeper"], ["caretaker"])) .toBe(true);
    expect(hasRoleCapability(["employee"], ["org_admin"])) .toBe(false);
    expect(hasRoleCapability(["employee"], [])).toBe(true);
  });

  it("should build user role filters for zero, one, and many normalized roles", () => {
    expect(buildUserRoleMatchFilter([])).toEqual({
      _id: { $exists: false },
    });
    expect(buildUserRoleMatchFilter(["admin"])).toEqual({
      $or: [{ role: "org_admin" }, { roles: "org_admin" }],
    });
    expect(buildUserRoleMatchFilter(["employee", "store_keeper"])).toEqual({
      $or: [
        { role: { $in: ["employee", "storekeeper"] } },
        { roles: { $in: ["employee", "storekeeper"] } },
      ],
    });
  });
});

describe("stored role permissions helpers", () => {
  it("should load, sanitize, and resolve role permission entries from settings", async () => {
    vi.mocked(SystemSettingsModel.findOne).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        role_permissions: {
          roles: [
            {
              id: "Office_Head",
              sourceRoles: ["directorate_head", "office_head"],
              permissions: {
                dashboard: ["view", "edit", "edit", "junk"],
                reports: ["create"],
              },
            },
            { id: "", permissions: { dashboard: ["view"] } },
          ],
        },
      }),
    } as never);

    const context = await loadStoredRolePermissionsContext();
    const entry = resolveStoredRolePermissionEntry(context, "office_head");

    expect(entry).toEqual({
      id: "office_head",
      sourceRoles: ["office_head"],
      permissions: {
        dashboard: ["view", "edit"],
        reports: ["create"],
      },
    });
    expect(resolveStoredRolePageActions(context, "directorate_head", "reports")).toEqual([]);
  });

  it("should return empty permissions when settings are missing or malformed", async () => {
    vi.mocked(SystemSettingsModel.findOne).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const context = await loadStoredRolePermissionsContext();

    expect(context).toEqual({ roles: [] });
    expect(resolveStoredRolePermissionEntry(context, "employee")).toBeNull();
    expect(resolveStoredRolePageActions(context, "employee", "dashboard")).toEqual(
      []
    );
  });

  it("should treat mutating actions as sufficient for view and reject missing required actions", () => {
    expect(hasPermissionAction(["create"], "view")).toBe(true);
    expect(hasPermissionAction(["edit"], "edit")).toBe(true);
    expect(hasPermissionAction(["view"], "delete")).toBe(false);
    expect(hasPermissionAction(undefined, "view")).toBe(false);
  });
});
