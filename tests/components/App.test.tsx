/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  role: "org_admin",
};

vi.mock("../../client/src/components/ui/toaster", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

vi.mock("../../client/src/components/ui/sonner", () => ({
  Toaster: () => <div data-testid="sonner" />,
}));

vi.mock("../../client/src/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../client/src/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState,
}));

vi.mock("../../client/src/contexts/PageSearchContext", () => ({
  PageSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePageSearch: () => ({ term: "", setTerm: vi.fn() }),
}));

vi.mock("../../client/src/components/auth/ProtectedRoute", () => ({
  ProtectedRoute: ({ children, page, anyOfPages, allowedRoles }: any) => (
    <div data-testid="protected-route" data-page={page || ""} data-anyof={(anyOfPages || []).join(",")} data-roles={(allowedRoles || []).join(",")}>
      {children}
    </div>
  ),
}));

vi.mock("../../client/src/pages/Dashboard", () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock("../../client/src/pages/Assets", () => ({ default: () => <div>Assets Page</div> }));
vi.mock("../../client/src/pages/Assignments", () => ({ default: () => <div>Assignments Page</div> }));
vi.mock("../../client/src/pages/MyAssets", () => ({ default: () => <div>My Assets Page</div> }));
vi.mock("../../client/src/pages/Profile", () => ({ default: () => <div>Profile Page</div> }));
vi.mock("../../client/src/pages/Settings", () => ({ default: () => <div>Settings Page</div> }));
vi.mock("../../client/src/pages/Login", () => ({ default: () => <div>Login Page</div> }));
vi.mock("../../client/src/pages/ForgotPassword", () => ({ default: () => <div>Forgot Password Page</div> }));
vi.mock("../../client/src/pages/NotFound", () => ({ default: () => <div>Not Found Page</div> }));

import App from "../../client/src/App";

async function renderAt(path: string) {
  window.history.pushState({}, "", path);
  render(<App />);
  await screen.findByTestId("toaster");
}

describe("App routing", () => {
  beforeEach(() => {
    authState.role = "org_admin";
  });

  afterEach(() => {
    cleanup();
  });

  it("should render the login route", async () => {
    await renderAt("/login");
    expect(await screen.findByText("Login Page")).toBeInTheDocument();
  });

  it("should render the forgot-password route", async () => {
    await renderAt("/forgot-password");
    expect(await screen.findByText("Forgot Password Page")).toBeInTheDocument();
  });

  it("should render the dashboard on the root route inside a protected wrapper", async () => {
    await renderAt("/");
    expect(await screen.findByText("Dashboard Page")).toBeInTheDocument();
    expect(screen.getByTestId("protected-route")).toHaveAttribute("data-page", "dashboard");
  });

  it("should redirect employees from assignments to my-assets", async () => {
    authState.role = "employee";
    await renderAt("/assignments");
    expect(await screen.findByText("My Assets Page")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/my-assets");
  });

  it("should redirect office asset aliases to the shared asset routes", async () => {
    await renderAt("/office/assets");
    expect(await screen.findByText("Assets Page")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/assets");
  });

  it("should wire allowed-role protected routes, profile, and not-found routing", async () => {
    await renderAt("/settings");
    expect(await screen.findByText("Settings Page")).toBeInTheDocument();
    expect(screen.getByTestId("protected-route")).toHaveAttribute(
      "data-roles",
      "org_admin,office_head"
    );

    cleanup();
    await renderAt("/profile");
    expect(await screen.findByText("Profile Page")).toBeInTheDocument();

    cleanup();
    await renderAt("/does-not-exist");
    expect(await screen.findByText("Not Found Page")).toBeInTheDocument();
  });
});
