/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiPostMock = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}));

import authService, { normalizeRole } from "../../client/src/services/authService";

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should normalize and persist the authenticated user on login", async () => {
    apiPostMock.mockResolvedValue({
      token: undefined,
      user: {
        id: "user-1",
        email: "admin@example.com",
        role: "OFFICE_HEAD",
        activeRole: "procurement_officer",
        roles: ["employee", "PROCUREMENT_OFFICER", "employee"],
      },
    });

    const result = await authService.login({ email: "admin@example.com", password: "Admin123!" });

    expect(apiPostMock).toHaveBeenCalledWith("/auth/login", {
      email: "admin@example.com",
      password: "Admin123!",
    });
    expect(result.user).toEqual({
      id: "user-1",
      email: "admin@example.com",
      role: "office_head",
      activeRole: "procurement_officer",
      roles: ["employee", "procurement_officer", "office_head"],
    });
    expect(JSON.parse(localStorage.getItem("user") || "null")).toEqual(result.user);
  });

  it("should normalize and persist the user on register with fallback role handling", async () => {
    apiPostMock.mockResolvedValue({
      user: {
        id: "user-2",
        email: "employee@example.com",
        role: "",
        activeRole: "",
        roles: [],
      },
    });

    const result = await authService.register({
      email: "employee@example.com",
      password: "StrongPass123!",
    });

    expect(apiPostMock).toHaveBeenCalledWith("/auth/register", {
      email: "employee@example.com",
      password: "StrongPass123!",
    });
    expect(result.user.role).toBe("employee");
    expect(result.user.activeRole).toBe("employee");
    expect(result.user.roles).toEqual(["employee"]);
  });

  it("should proxy forgot-password and reset-password requests", async () => {
    apiPostMock
      .mockResolvedValueOnce({ message: "Request received" })
      .mockResolvedValueOnce({ message: "Password reset successful" });

    await expect(authService.requestPasswordReset("user@example.com")).resolves.toEqual({
      message: "Request received",
    });
    await expect(
      authService.resetPassword({ token: "reset-token", newPassword: "NewPass123!" })
    ).resolves.toEqual({ message: "Password reset successful" });

    expect(apiPostMock).toHaveBeenNthCalledWith(1, "/auth/forgot-password", { email: "user@example.com" });
    expect(apiPostMock).toHaveBeenNthCalledWith(2, "/auth/reset-password", {
      token: "reset-token",
      newPassword: "NewPass123!",
    });
  });

  it("should update the stored active role when the backend accepts a role switch", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: "user-3",
        email: "head@example.com",
        role: "office_head",
        activeRole: "office_head",
        roles: ["office_head", "procurement_officer"],
      })
    );
    apiPostMock.mockResolvedValue({
      role: "office_head",
      activeRole: "procurement_officer",
      roles: ["office_head", "procurement_officer"],
    });

    const result = await authService.setActiveRole("procurement_officer");

    expect(apiPostMock).toHaveBeenCalledWith("/auth/active-role", { activeRole: "procurement_officer" });
    expect(result).toEqual({
      role: "office_head",
      activeRole: "procurement_officer",
      roles: ["office_head", "procurement_officer"],
    });
    expect(JSON.parse(localStorage.getItem("user") || "null")).toMatchObject({
      activeRole: "procurement_officer",
      roles: ["office_head", "procurement_officer"],
    });
  });

  it("should return the next active role without writing storage when no current user exists", async () => {
    apiPostMock.mockResolvedValue({
      role: "employee",
      activeRole: "employee",
      roles: ["employee", "caretaker"],
    });

    const result = await authService.setActiveRole("caretaker");

    expect(result).toEqual({
      role: "employee",
      activeRole: "employee",
      roles: ["employee", "caretaker"],
    });
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("should normalize and rewrite stored users when getCurrentUser reads malformed role data", () => {
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: "user-4",
        email: "casey@example.com",
        role: "CARETAKER",
        activeRole: "not-a-real-role",
        roles: ["CARETAKER", "", null],
      })
    );

    const result = authService.getCurrentUser();

    expect(result).toEqual({
      id: "user-4",
      email: "casey@example.com",
      role: "caretaker",
      activeRole: "caretaker",
      roles: ["caretaker", "employee"],
    });
    expect(JSON.parse(localStorage.getItem("user") || "null")).toEqual(result);
  });

  it("should report authentication state from localStorage and clear it on logout", () => {
    expect(authService.isAuthenticated()).toBe(false);

    localStorage.setItem("user", JSON.stringify({ id: "user-5", email: "user@example.com", role: "employee" }));

    expect(authService.isAuthenticated()).toBe(true);

    authService.logout();

    expect(localStorage.getItem("user")).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);
  });

  it("should normalize known roles and default unknown or empty values to employee", () => {
    expect(normalizeRole("ORG_ADMIN")).toBe("org_admin");
    expect(normalizeRole("inventory_controller")).toBe("inventory_controller");
    expect(normalizeRole("custom_role")).toBe("custom_role");
    expect(normalizeRole("   ")).toBe("employee");
    expect(normalizeRole(undefined)).toBe("employee");
  });
});
