/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

const useAuthMock = vi.fn();
const canAccessPageMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/config/pagePermissions", () => ({
  canAccessPage: (args: unknown) => canAccessPageMock(args),
}));

import { ProtectedRoute } from "../../client/src/components/auth/ProtectedRoute";

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccessPageMock.mockReturnValue(true);
  });

  it("should render a loading spinner while auth state is loading", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      isOrgAdmin: false,
      role: null,
      locationId: null,
    });

    render(
      <MemoryRouter future={routerFuture}>
        <ProtectedRoute>
          <div>Secret content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("should redirect unauthenticated users to the login page", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isOrgAdmin: false,
      role: null,
      locationId: null,
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/reports"]}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/reports" element={<ProtectedRoute><div>Secret content</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("should show the office assignment notice for authenticated non-admin users without a location", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isOrgAdmin: false,
      role: "employee",
      locationId: null,
    });

    render(
      <MemoryRouter future={routerFuture}>
        <ProtectedRoute>
          <div>Secret content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText("Office Assignment Required")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("should redirect users without page permission back to the home route", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isOrgAdmin: false,
      role: "employee",
      locationId: "office-1",
    });
    canAccessPageMock.mockReturnValue(false);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/settings"]}>
        <Routes>
          <Route path="/" element={<div>Home page</div>} />
          <Route path="/settings" element={<ProtectedRoute page={"settings" as never}><div>Settings</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("should render children for authorized users", () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isOrgAdmin: false,
      role: "office_head",
      locationId: "office-1",
    });

    render(
      <MemoryRouter future={routerFuture}>
        <ProtectedRoute allowedRoles={["office_head"]} page={"dashboard" as never}>
          <div>Secret content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
});
