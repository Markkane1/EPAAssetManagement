/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "../../client/src/contexts/AuthContext";
import { API_BASE_URL } from "../../client/src/lib/api";
import { mswServer } from "./msw-server";

const Consumer = () => {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="auth-state">
        {auth.isLoading
          ? "loading"
          : auth.isAuthenticated
            ? `${auth.user?.email}|${auth.role}|${auth.activeRole}|${auth.locationId ?? "none"}`
            : "guest"}
      </div>
      <div data-testid="roles">{auth.roles.join(",")}</div>
      <div data-testid="org-admin">{String(auth.isOrgAdmin)}</div>
      <button type="button" onClick={() => auth.login("admin@example.com", "Admin123!")}>
        Login
      </button>
      <button type="button" onClick={() => auth.switchActiveRole("office_head")}>
        Switch role
      </button>
      <button type="button" onClick={() => auth.logout()}>
        Logout
      </button>
    </div>
  );
};

const renderProvider = () =>
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "csrf_token=test-csrf-token";
  });

  it("should load the current user, normalize roles, and expose authenticated state on mount", async () => {
    mswServer.use(
      http.get(`${API_BASE_URL}/auth/me`, () =>
        HttpResponse.json({
          id: "user-1",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          role: "ORG_ADMIN",
          activeRole: "ORG_ADMIN",
          roles: ["ORG_ADMIN", "office_head"],
          locationId: "office-1",
        })
      ),
      http.get(`${API_BASE_URL}/settings/page-permissions/effective`, () =>
        HttpResponse.json({
          role: "org_admin",
          permissions: { dashboard: ["view"] },
          allowed_pages: ["dashboard"],
          updated_at: null,
          updated_by_user_id: null,
        })
      )
    );

    renderProvider();

    expect(screen.getByTestId("auth-state")).toHaveTextContent("loading");

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent(
        "admin@example.com|org_admin|org_admin|office-1"
      );
    });
    expect(screen.getByTestId("roles")).toHaveTextContent("org_admin,office_head");
    expect(screen.getByTestId("org-admin")).toHaveTextContent("true");
    expect(localStorage.getItem("user")).toContain("admin@example.com");
  });

  it("should fall back to guest state and clear cached auth data when /auth/me fails", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "stale", email: "stale@example.com", role: "employee" })
    );

    mswServer.use(
      http.get(`${API_BASE_URL}/auth/me`, () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
      )
    );

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("guest");
    });
    expect(localStorage.getItem("user")).toBeNull();
    expect(screen.getByTestId("roles")).toHaveTextContent("");
  });

  it("should preserve cached auth data when /auth/me fails transiently", async () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ id: "cached", email: "cached@example.com", role: "employee", activeRole: "employee", roles: ["employee"] })
    );

    mswServer.use(
      http.get(`${API_BASE_URL}/auth/me`, () =>
        HttpResponse.json({ message: "Temporary failure" }, { status: 500 })
      )
    );

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent(
        "cached@example.com|employee|employee|none"
      );
    });
    expect(localStorage.getItem("user")).toContain("cached@example.com");
  });

  it("should execute login, activity logging, role switching, and logout against the API surface", async () => {
    let meState = {
      id: "user-1",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      role: "org_admin",
      activeRole: "org_admin",
      roles: ["org_admin", "office_head"],
      locationId: "office-1",
    };

    mswServer.use(
      http.get(`${API_BASE_URL}/auth/me`, () => HttpResponse.json(meState)),
      http.get(`${API_BASE_URL}/settings/page-permissions/effective`, () =>
        HttpResponse.json({
          role: meState.activeRole,
          permissions: { dashboard: ["view"] },
          allowed_pages: ["dashboard"],
          updated_at: null,
          updated_by_user_id: null,
        })
      ),
      http.post(`${API_BASE_URL}/auth/login`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ email: "admin@example.com", password: "Admin123!" });
        return HttpResponse.json({
          user: {
            id: "user-1",
            email: "admin@example.com",
            role: "org_admin",
            activeRole: "org_admin",
            roles: ["org_admin", "office_head"],
          },
        });
      }),
      http.post(`${API_BASE_URL}/activities`, async ({ request }) => {
        const body = await request.json();
        expect(body).toMatchObject({ activityType: "login" });
        return HttpResponse.json(
          {
            id: "activity-1",
            user_id: "user-1",
            activity_type: "login",
            description: "User logged in",
            metadata: {},
            ip_address: null,
            user_agent: null,
            created_at: new Date().toISOString(),
          },
          { status: 201 }
        );
      }),
      http.post(`${API_BASE_URL}/auth/active-role`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ activeRole: "office_head" });
        meState = {
          ...meState,
          role: "org_admin",
          activeRole: "office_head",
        };
        return HttpResponse.json({
          role: "org_admin",
          activeRole: "office_head",
          roles: ["org_admin", "office_head"],
        });
      }),
      http.post(`${API_BASE_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 }))
    );

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent(
        "admin@example.com|org_admin|org_admin|office-1"
      );
    });

    await userEvent.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent(
        "admin@example.com|org_admin|org_admin|office-1"
      );
    });

    await userEvent.click(screen.getByRole("button", { name: "Switch role" }));
    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent(
        "admin@example.com|org_admin|office_head|office-1"
      );
    });

    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("guest");
    });
    expect(localStorage.getItem("user")).toBeNull();
  });
});
