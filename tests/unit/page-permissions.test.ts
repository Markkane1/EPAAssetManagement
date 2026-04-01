import { afterEach, describe, expect, it } from "vitest";

import {
  canAccessPage,
  setRuntimeRolePermissions,
} from "../../client/src/config/pagePermissions";

describe("pagePermissions", () => {
  afterEach(() => {
    setRuntimeRolePermissions(null);
  });

  it("should deny access when no role is provided", () => {
    expect(canAccessPage({ page: "dashboard", role: null, isOrgAdmin: false })).toBe(false);
  });

  it("should deny employee access to restricted asset management pages", () => {
    expect(canAccessPage({ page: "assets", role: "employee", isOrgAdmin: false })).toBe(false);
    expect(canAccessPage({ page: "settings", role: "employee", isOrgAdmin: false })).toBe(false);
  });

  it("should deny office heads access to restricted category, project, and scheme pages", () => {
    expect(canAccessPage({ page: "categories", role: "office_head", isOrgAdmin: false })).toBe(false);
    expect(canAccessPage({ page: "projects", role: "office_head", isOrgAdmin: false })).toBe(false);
    expect(canAccessPage({ page: "schemes", role: "office_head", isOrgAdmin: false })).toBe(false);
  });

  it("should allow org admins to bypass static page restrictions", () => {
    expect(canAccessPage({ page: "user-management", role: "employee", isOrgAdmin: true })).toBe(true);
  });

  it("should resolve alias pages through their linked permission groups", () => {
    setRuntimeRolePermissions([
      {
        id: "caretaker-runtime",
        sourceRoles: ["caretaker"],
        permissions: {
          assets: ["view"],
          "asset-items": ["view"],
        },
      },
      {
        id: "office-head-runtime",
        sourceRoles: ["office_head"],
        permissions: {
          assets: ["view"],
          "asset-items": ["view"],
        },
      },
    ]);
    expect(canAccessPage({ page: "office-assets", role: "caretaker", isOrgAdmin: false })).toBe(true);
    expect(canAccessPage({ page: "office-asset-items", role: "office_head", isOrgAdmin: false })).toBe(true);
  });

  it("should allow runtime role permissions with view-equivalent actions", () => {
    setRuntimeRolePermissions([
      {
        id: "temporary-procurement",
        sourceRoles: ["procurement_officer"],
        permissions: {
          reports: ["edit", "edit", "invalid" as never],
          compliance: ["view"],
        },
      },
    ]);

    expect(canAccessPage({ page: "reports", role: "procurement_officer", isOrgAdmin: false })).toBe(true);
    expect(canAccessPage({ page: "compliance", role: "procurement_officer", isOrgAdmin: false })).toBe(true);
    expect(canAccessPage({ page: "settings", role: "procurement_officer", isOrgAdmin: false })).toBe(false);
  });

  it("should deny runtime-managed pages when the runtime permission set omits valid actions", () => {
    setRuntimeRolePermissions([
      {
        id: "",
        sourceRoles: ["employee"],
        permissions: { dashboard: ["view"] },
      } as never,
      {
        id: "employee-runtime",
        sourceRoles: ["employee"],
        permissions: { assets: ["not-valid" as never] },
      },
    ]);

    expect(canAccessPage({ page: "dashboard", role: "employee", isOrgAdmin: false })).toBe(false);
    expect(canAccessPage({ page: "assets", role: "employee", isOrgAdmin: false })).toBe(false);
  });
});
