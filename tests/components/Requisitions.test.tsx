/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const navigateMock = vi.fn();
const useAuthMock = vi.fn();
const useLocationsMock = vi.fn();
const requisitionListMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => useQueryMock(config),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: "/requisitions" }),
  };
});

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onClick: () => void } }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {action ? <button type="button" onClick={action.onClick}>{action.label}</button> : null}
    </div>
  ),
}));

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({ data, onRowClick }: { data: Array<Record<string, unknown>>; onRowClick?: (row: Record<string, unknown>) => void }) => (
    <div>
      {data.map((row) => (
        <button key={String(row.id)} type="button" onClick={() => onRowClick?.(row)}>
          {String(row.file_number)}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => useLocationsMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/services/requisitionService", () => ({
  requisitionService: {
    list: (...args: unknown[]) => requisitionListMock(...args),
  },
}));

import Requisitions from "../../client/src/pages/Requisitions";

describe("Requisitions page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "employee" });
    useLocationsMock.mockReturnValue({ data: [{ id: "office-1", name: "Central Office" }] });
    requisitionListMock.mockReturnValue({
      data: [
        {
          id: "req-1",
          file_number: "REQ-001",
          status: "SUBMITTED",
          office_id: "office-1",
          submitted_by_user_id: "user-1",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    });
    useQueryMock.mockImplementation(({ queryFn }: { queryFn: () => unknown }) => ({
      data: queryFn(),
      isLoading: false,
    }));
  });

  it("should render a loading spinner while requisitions are loading", () => {
    useQueryMock.mockReturnValue({ isLoading: true, data: undefined });

    const { container } = render(<Requisitions />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("should let employees create requisitions and open details from the list", async () => {
    const { container } = render(<Requisitions />);

    await userEvent.click(screen.getByRole("button", { name: /new requisition/i }));
    expect(navigateMock).toHaveBeenCalledWith("/requisitions/new");

    await userEvent.click(screen.getByRole("button", { name: "REQ-001" }));
    expect(navigateMock).toHaveBeenCalledWith("/requisitions/req-1", {
      state: { from: "/requisitions" },
    });
  });

  it("should apply and reset filters while mapping employee submitted statuses correctly", async () => {
    const { container } = render(<Requisitions />);

    expect(requisitionListMock).toHaveBeenLastCalledWith({
      limit: 200,
      queue: undefined,
      status: undefined,
      fileNumber: undefined,
      from: undefined,
      to: undefined,
    });

    const select = container.querySelector("select");
    const dateInputs = container.querySelectorAll('input[type="date"]');
    if (!select || dateInputs.length < 2) {
      throw new Error("Expected requisition filters to render");
    }

    await userEvent.selectOptions(select, "SUBMITTED");
    await userEvent.type(screen.getByPlaceholderText(/search file number/i), "REQ-001");
    await userEvent.type(dateInputs[0], "2026-03-01");
    await userEvent.type(dateInputs[1], "2026-03-05");
    await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(requisitionListMock).toHaveBeenLastCalledWith({
      limit: 200,
      queue: undefined,
      status: undefined,
      fileNumber: "REQ-001",
      from: "2026-03-01",
      to: "2026-03-05",
    });

    await userEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(requisitionListMock).toHaveBeenLastCalledWith({
      limit: 200,
      queue: undefined,
      status: undefined,
      fileNumber: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("should hide the create action for non-employee roles", () => {
    useAuthMock.mockReturnValue({ role: "office_head" });

    render(<Requisitions />);

    expect(screen.queryByRole("button", { name: /new requisition/i })).not.toBeInTheDocument();
  });
});
