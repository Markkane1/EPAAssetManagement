/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const canAccessPageMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/config/pagePermissions", () => ({
  canAccessPage: (args: unknown) => canAccessPageMock(args),
}));

import { Sidebar } from "../../client/src/components/layout/Sidebar";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function renderSidebar(pathname = "/") {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[pathname]} future={routerFuture}>
        <Sidebar />
      </MemoryRouter>
    </TooltipProvider>
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    sessionStorage.clear();
    canAccessPageMock.mockImplementation(({ page }: { page: string }) => page !== "settings");
    useAuthMock.mockReturnValue({
      user: { email: "admin@example.com" },
      role: "org_admin",
      isOrgAdmin: true,
    });
  });

  it("should render admin navigation sections and collapse the sidebar when toggled", async () => {
    const user = userEvent.setup();
    renderSidebar("/");

    expect(screen.getByText("EPA AMS")).toBeInTheDocument();
    expect(screen.getByText("Movable Assets")).toBeInTheDocument();
    expect(screen.getByText("Management")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Org Admin")).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();

    const collapseButton = screen.getAllByRole("button").find((button) =>
      button.className.includes("h-8 w-8")
    );

    expect(collapseButton).toBeDefined();

    await user.click(collapseButton!);

    expect(screen.queryByText("EPA AMS")).not.toBeInTheDocument();
    expect(screen.queryByText("Org Admin")).not.toBeInTheDocument();
  });

  it("should show only employee-relevant navigation and restrict reports to the employee subset", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      user: { email: "employee.user@example.com" },
      role: "employee",
      isOrgAdmin: false,
    });
    canAccessPageMock.mockImplementation(({ page }: { page: string }) =>
      ["dashboard", "assignments", "inventory", "requisitions", "returns", "reports", "compliance"].includes(page)
    );

    renderSidebar("/reports");

    expect(screen.getByText("Employee Services")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /employee services/i }));
    expect(screen.getByText("My Assets")).toBeInTheDocument();
    expect(screen.getByText("My Requisitions")).toBeInTheDocument();
    expect(screen.getByText("Assignment Summary")).toBeInTheDocument();
    expect(screen.getByText("Employee Assets")).toBeInTheDocument();
    expect(screen.queryByText("Movable Assets")).not.toBeInTheDocument();
    expect(screen.queryByText("Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Asset Summary")).not.toBeInTheDocument();
    expect(screen.getByText("Employee")).toBeInTheDocument();
  });

  it("should format unknown role labels into title case in the footer", () => {
    useAuthMock.mockReturnValue({
      user: { email: "procurement@example.com" },
      role: "procurement_officer",
      isOrgAdmin: false,
    });
    canAccessPageMock.mockReturnValue(true);

    renderSidebar("/");

    expect(screen.getByText("procurement")).toBeInTheDocument();
    expect(screen.getByText("Procurement Officer")).toBeInTheDocument();
  });
});
