/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const useQueryMock = vi.fn();
const useEmployeesMock = vi.fn();
const useLocationsMock = vi.fn();
const useAuthMock = vi.fn();

const rowClickMock = vi.fn();
const capturedQueryKeys: unknown[][] = [];

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: { queryKey: unknown[] }) => {
    capturedQueryKeys.push(config.queryKey);
    return useQueryMock(config);
  },
}));

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({
    data,
    onRowClick,
  }: {
    data: Array<Record<string, unknown>>;
    onRowClick?: (row: { id: string }) => void;
  }) => (
    <div>
      <button type="button" onClick={() => rowClickMock()}>
        mock-table
      </button>
      {data.map((row) => (
        <button key={String(row.id)} type="button" onClick={() => onRowClick?.({ id: String(row.id) })}>
          open-{String(row.id)}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/hooks/useEmployees", () => ({ useEmployees: () => useEmployeesMock() }));
vi.mock("@/hooks/useLocations", () => ({ useLocations: () => useLocationsMock() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/services/returnRequestService", () => ({ returnRequestService: { list: vi.fn() } }));

import Returns from "../../client/src/pages/Returns";

describe("Returns page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedQueryKeys.length = 0;
    useAuthMock.mockReturnValue({
      role: "office_head",
      user: { id: "user-1", email: "manager@test.com" },
    });
    useEmployeesMock.mockReturnValue({
      data: [
        {
          id: "employee-1",
          user_id: "user-1",
          email: "manager@test.com",
          first_name: "Casey",
          last_name: "Manager",
        },
        {
          id: "employee-2",
          user_id: "user-2",
          email: "staff@test.com",
          first_name: "Sam",
          last_name: "Staff",
        },
      ],
    });
    useLocationsMock.mockReturnValue({
      data: [{ id: "office-1", name: "Main Office" }],
    });
    useQueryMock.mockReturnValue({
      data: {
        data: [
          {
            id: "return-2",
            employee_id: "employee-2",
            office_id: "office-1",
            status: "CLOSED",
            created_at: "2026-03-02T00:00:00.000Z",
            lines: [{ asset_item_id: "asset-1" }],
          },
          {
            id: "return-1",
            employee_id: "employee-1",
            office_id: "office-1",
            status: "SUBMITTED",
            created_at: "2026-03-03T00:00:00.000Z",
            lines: [{ asset_item_id: "asset-2" }, { asset_item_id: "asset-3" }],
          },
        ],
      },
      isLoading: false,
    });
  });

  it("should render a loading state while the return request query is loading", () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<Returns />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("should apply and reset filters by changing the query key inputs", async () => {
    const { container } = render(<Returns />);

    const selects = screen.getAllByRole("combobox");
    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]'));

    await userEvent.selectOptions(selects[0], "CLOSED");
    await userEvent.selectOptions(selects[1], "employee-2");
    await userEvent.type(dateInputs[0], "2026-03-01");
    await userEvent.type(dateInputs[1], "2026-03-31");
    await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(capturedQueryKeys.at(-1)).toEqual([
      "return-requests",
      "CLOSED",
      "employee-2",
      "2026-03-01",
      "2026-03-31",
    ]);

    await userEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(capturedQueryKeys.at(-1)).toEqual([
      "return-requests",
      "ALL",
      "ALL",
      "",
      "",
    ]);
  });

  it("should navigate to the selected return detail when a table row is clicked", async () => {
    render(<Returns />);

    await userEvent.click(screen.getByRole("button", { name: /open-return-1/i }));

    expect(navigateMock).toHaveBeenCalledWith("/returns/return-1");
  });

  it("should render employee scope as a read-only field for employee users", () => {
    useAuthMock.mockReturnValue({
      role: "employee",
      user: { id: "user-1", email: "manager@test.com" },
    });

    render(<Returns />);

    expect(screen.getByDisplayValue("Casey Manager")).toHaveAttribute("readonly");
    expect(capturedQueryKeys.at(-1)).toEqual([
      "return-requests",
      "ALL",
      "employee-1",
      "",
      "",
    ]);
  });
});
