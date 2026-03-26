/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const useDashboardMeMock = vi.fn();
const useDashboardPanelsMock = vi.fn();
const useDashboardStatsMock = vi.fn();
const useAssignmentsByEmployeeMock = vi.fn();
const usePageSearchMock = vi.fn();
const useQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (args: unknown) => useQueryMock(args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useDashboard", () => ({
  useDashboardMe: (args: unknown) => useDashboardMeMock(args),
  useDashboardPanels: (search: string, args: unknown) => useDashboardPanelsMock(search, args),
  useDashboardStats: (args: unknown) => useDashboardStatsMock(args),
}));

vi.mock("@/hooks/useAssignments", () => ({
  useAssignmentsByEmployee: (employeeId: string) => useAssignmentsByEmployeeMock(employeeId),
}));

vi.mock("@/contexts/PageSearchContext", () => ({
  usePageSearch: () => usePageSearchMock(),
}));

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  ),
}));

vi.mock("@/components/dashboard/StatsCard", () => ({
  StatsCard: ({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) => (
    <div>
      <span>{title}</span>
      <span>{String(value)}</span>
      {subtitle ? <span>{subtitle}</span> : null}
    </div>
  ),
}));

vi.mock("@/components/dashboard/RecentActivity", () => ({ RecentActivity: () => <div>RecentActivityChart</div> }));
vi.mock("@/components/dashboard/AssetsByCategory", () => ({ AssetsByCategory: () => <div>AssetsByCategoryChart</div> }));
vi.mock("@/components/dashboard/AssetStatusChart", () => ({ AssetStatusChart: () => <div>AssetStatusChart</div> }));
vi.mock("@/components/dashboard/PendingPurchaseOrders", () => ({ PendingPurchaseOrders: () => <div>PendingPurchaseOrders</div> }));
vi.mock("@/components/shared/StatusBadge", () => ({ StatusBadge: ({ status }: { status: string }) => <span>{status}</span> }));

import Dashboard from "../../client/src/pages/Dashboard";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function renderDashboard() {
  return render(
    <MemoryRouter future={routerFuture}>
      <Dashboard />
    </MemoryRouter>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "org_admin", user: { id: "user-1", email: "admin@example.com" } });
    useDashboardMeMock.mockReturnValue({
      data: { employeeId: null, openRequisitionsCount: 0, openReturnsCount: 0 },
      isLoading: false,
    });
    useDashboardPanelsMock.mockReturnValue({
      data: {
        recentItems: [
          { id: "ai-1", tag: "TAG-1", serial_number: "SER-1", item_status: "Available" },
          { id: "ai-2", tag: "TAG-2", serial_number: "SER-2", item_status: "Assigned" },
        ],
        locations: [{ id: "office-1", name: "Lahore Office", address: "Mall Road", assetCount: 3 }],
        storeItemCount: 9,
      },
      isLoading: false,
    });
    useDashboardStatsMock.mockReturnValue({
      data: {
        totalAssets: 5,
        totalAssetItems: 12,
        assignedItems: 4,
        availableItems: 8,
        maintenanceItems: 1,
        totalValue: 120000,
        lowStockAlerts: 2,
      },
      isLoading: false,
    });
    useAssignmentsByEmployeeMock.mockReturnValue({ data: [], isLoading: false });
    usePageSearchMock.mockReturnValue({ term: "", setTerm: vi.fn() });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey.includes("consumable-balances")) {
        return { data: [], isLoading: false };
      }
      return { data: undefined, isLoading: false };
    });
  });

  it("should render an employee mapping warning when an employee login is not linked to an employee profile", () => {
    useAuthMock.mockReturnValue({ role: "employee", user: { id: "user-emp", email: "employee@example.com" } });

    renderDashboard();

    expect(screen.getByText("Employee mapping missing")).toBeInTheDocument();
    expect(screen.getByText(/not linked to an employee profile/i)).toBeInTheDocument();
    expect(screen.getByText("Assigned Moveable")).toBeInTheDocument();
    expect(screen.getByText("0 total qty on hand")).toBeInTheDocument();
  });

  it("should render employee dashboard stats, quick actions, and recent assignment records when the employee is mapped", () => {
    useAuthMock.mockReturnValue({ role: "employee", user: { id: "user-emp", email: "employee@example.com" } });
    useDashboardMeMock.mockReturnValue({
      data: { employeeId: "emp-1", openRequisitionsCount: 1, openReturnsCount: 1 },
      isLoading: false,
    });
    useAssignmentsByEmployeeMock.mockReturnValue({
      data: [
        { id: "asn-1", employee_id: "emp-1", status: "ISSUED", assigned_date: "2026-03-05T00:00:00.000Z" },
        { id: "asn-2", employee_id: "emp-1", status: "RETURN_REQUESTED", assigned_date: "2026-03-06T00:00:00.000Z" },
      ],
      isLoading: false,
    });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey.includes("consumable-balances")) {
        return {
          data: [{ holder_type: "EMPLOYEE", qty_on_hand_base: 5 }],
          isLoading: false,
        };
      }
      return { data: undefined, isLoading: false };
    });

    renderDashboard();

    expect(screen.getByText("Assigned Moveable")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Consumable Lines")).toBeInTheDocument();
    expect(screen.getByText("5 total qty on hand")).toBeInTheDocument();
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Assets" })).toBeInTheDocument();
    expect(screen.getByText("Recent Assignment Records")).toBeInTheDocument();
    expect(screen.getByText(/Assignment asn-1/i)).toBeInTheDocument();
    expect(screen.getByText("ISSUED")).toBeInTheDocument();
  });

  it("should render a loading shell while admin stats are still loading", () => {
    useDashboardStatsMock.mockReturnValue({ data: undefined, isLoading: true });

    renderDashboard();

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Overview of your asset management")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("should render the admin dashboard overview, charts, recent items, and store summary", () => {
    renderDashboard();

    expect(screen.getByText("Total Assets")).toBeInTheDocument();
    expect(screen.getByText("PKR 120,000")).toBeInTheDocument();
    expect(screen.getByText("AssetStatusChart")).toBeInTheDocument();
    expect(screen.getByText("AssetsByCategoryChart")).toBeInTheDocument();
    expect(screen.getByText("RecentActivityChart")).toBeInTheDocument();
    expect(screen.getByText("PendingPurchaseOrders")).toBeInTheDocument();
    expect(screen.getByText("Recent Asset Items")).toBeInTheDocument();
    expect(screen.getByText("Tag: TAG-1")).toBeInTheDocument();
    expect(screen.getByText("Locations Overview")).toBeInTheDocument();
    expect(screen.getByText("Lahore Office")).toBeInTheDocument();
    expect(screen.getByText("Head Office Store")).toBeInTheDocument();
  });
});
