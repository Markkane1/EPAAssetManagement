/** @vitest-environment jsdom */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Package } from "lucide-react";

const useRecentActivityMock = vi.fn();
const usePurchaseOrdersMock = vi.fn();
const useVendorsMock = vi.fn();
const useCategoriesMock = vi.fn();
const useAssetsMock = vi.fn();
const useAssetsByStatusMock = vi.fn();

vi.mock("@/hooks/useDashboard", () => ({
  useRecentActivity: (...args: unknown[]) => useRecentActivityMock(...args),
  useAssetsByStatus: (...args: unknown[]) => useAssetsByStatusMock(...args),
}));

vi.mock("@/hooks/usePurchaseOrders", () => ({
  usePurchaseOrders: (...args: unknown[]) => usePurchaseOrdersMock(...args),
}));

vi.mock("@/hooks/useVendors", () => ({
  useVendors: (...args: unknown[]) => useVendorsMock(...args),
}));

vi.mock("@/hooks/useCategories", () => ({
  useCategories: (...args: unknown[]) => useCategoriesMock(...args),
}));

vi.mock("@/hooks/useAssets", () => ({
  useAssets: (...args: unknown[]) => useAssetsMock(...args),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: ({ fill }: { fill: string }) => <div data-testid="pie-cell">{fill}</div>,
  Legend: () => <div data-testid="legend" />,
  Tooltip: () => <div data-testid="chart-tooltip" />,
}));

import { StatsCard } from "../../client/src/components/dashboard/StatsCard";
import { RecentActivity } from "../../client/src/components/dashboard/RecentActivity";
import { PendingPurchaseOrders } from "../../client/src/components/dashboard/PendingPurchaseOrders";
import { AssetsByCategory } from "../../client/src/components/dashboard/AssetsByCategory";
import { AssetStatusChart } from "../../client/src/components/dashboard/AssetStatusChart";

describe("dashboard widgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00.000Z"));
    useRecentActivityMock.mockReturnValue({ data: [] });
    usePurchaseOrdersMock.mockReturnValue({ data: [] });
    useVendorsMock.mockReturnValue({ data: [] });
    useCategoriesMock.mockReturnValue({ data: [] });
    useAssetsMock.mockReturnValue({ data: [] });
    useAssetsByStatusMock.mockReturnValue({ data: [] });
  });

  it("should render stats cards with localized numbers, subtitles, and trends", () => {
    render(
      <StatsCard
        title="Total Assets"
        value={12500}
        subtitle="Across all offices"
        icon={Package}
        variant="success"
        trend={{ value: 12, isPositive: true }}
      />
    );

    expect(screen.getByText("Total Assets")).toBeInTheDocument();
    expect(screen.getByText("12,500")).toBeInTheDocument();
    expect(screen.getByText("Across all offices")).toBeInTheDocument();
    expect(screen.getByText("+12%")).toBeInTheDocument();
  });

  it("should render recent activity empty and populated states with fallback type handling", () => {
    const { rerender } = render(<RecentActivity />);
    expect(screen.getByText("No recent activity")).toBeInTheDocument();

    useRecentActivityMock.mockReturnValue({
      data: [
        {
          id: "activity-1",
          type: "new_asset",
          description: "Laptop added",
          timestamp: "2026-03-07T11:30:00.000Z",
          user: "Admin",
        },
        {
          id: "activity-2",
          type: "unknown_type",
          description: "Fallback event",
          timestamp: "2026-03-07T10:00:00.000Z",
          user: "System",
        },
      ],
    });

    rerender(<RecentActivity />);

    expect(screen.getByText("New Asset Added")).toBeInTheDocument();
    expect(screen.getByText("Asset Assigned")).toBeInTheDocument();
    expect(screen.getByText("Fallback event")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("should render pending purchase orders and resolve vendor names and status styles", () => {
    usePurchaseOrdersMock.mockReturnValue({
      data: [
        { id: "po-1", order_number: "PO-001", vendor_id: "vendor-1", status: "Pending", total_amount: 10000 },
        { id: "po-2", order_number: "PO-002", vendor_id: null, status: "Approved", total_amount: 5000 },
        { id: "po-3", order_number: "PO-003", vendor_id: "vendor-2", status: "Received", total_amount: 3000 },
      ],
    });
    useVendorsMock.mockReturnValue({
      data: [{ id: "vendor-1", name: "Acme Supplies" }],
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PendingPurchaseOrders />
      </MemoryRouter>
    );

    expect(screen.getByText("PO-001")).toBeInTheDocument();
    expect(screen.getByText("Acme Supplies")).toBeInTheDocument();
    expect(screen.getByText("Unknown Vendor")).toBeInTheDocument();
    expect(screen.queryByText("PO-003")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/purchase-orders");
  });

  it("should render category distribution bars sorted by asset count", () => {
    useCategoriesMock.mockReturnValue({
      data: [
        { id: "cat-1", name: "Furniture" },
        { id: "cat-2", name: "Electronics" },
      ],
    });
    useAssetsMock.mockReturnValue({
      data: [
        { id: "asset-1", category_id: "cat-2" },
        { id: "asset-2", category_id: "cat-2" },
        { id: "asset-3", category_id: "cat-1" },
      ],
    });

    render(<AssetsByCategory />);

    const labels = screen.getAllByText(/Furniture|Electronics/).map((node) => node.textContent);
    expect(labels[0]).toBe("Electronics");
    expect(screen.getByText("2 (67%)")).toBeInTheDocument();
    expect(screen.getByText("1 (33%)")).toBeInTheDocument();
  });

  it("should render asset status chart empty state and mapped chart cells", () => {
    const { rerender } = render(<AssetStatusChart />);
    expect(screen.getByText("No status data available")).toBeInTheDocument();

    useAssetsByStatusMock.mockReturnValue({
      data: [
        { status: "Available", count: 4 },
        { status: "Unexpected", count: 1 },
      ],
    });

    rerender(<AssetStatusChart />);

    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
    expect(screen.getAllByTestId("pie-cell").map((node) => node.textContent)).toEqual([
      "hsl(142, 76%, 36%)",
      "hsl(215, 16%, 47%)",
    ]);
  });
});
