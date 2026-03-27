/** @vitest-environment jsdom */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const useLocationsMock = vi.fn();
const usePagedVendorsMock = vi.fn();
const useVendorMock = vi.fn();
const useCreateVendorMock = vi.fn();
const useUpdateVendorMock = vi.fn();
const useDeleteVendorMock = vi.fn();

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({
    data,
    actions,
  }: {
    data: Array<Record<string, unknown>>;
    actions?: (row: Record<string, unknown>) => React.ReactNode;
  }) => (
    <div>
      {data.map((row) => (
        <div key={String(row.id)}>
          <span>{String(row.name)}</span>
          {actions ? actions(row) : null}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/forms/VendorFormModal", () => ({
  VendorFormModal: () => <div data-testid="vendor-form-modal" />,
}));

vi.mock("@/components/shared/SearchableSelect", () => ({
  SearchableSelect: () => <div data-testid="office-filter" />,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => useLocationsMock(),
}));

vi.mock("@/hooks/useVendors", () => ({
  usePagedVendors: (filters?: unknown) => usePagedVendorsMock(filters),
  useVendor: (id: string) => useVendorMock(id),
  useCreateVendor: () => useCreateVendorMock(),
  useUpdateVendor: () => useUpdateVendorMock(),
  useDeleteVendor: () => useDeleteVendorMock(),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

import Vendors from "../../client/src/pages/Vendors";

describe("Vendors page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      role: "org_admin",
      locationId: "office-1",
    });
    useLocationsMock.mockReturnValue({
      data: [{ id: "office-1", name: "Central Lab", created_at: "", updated_at: "" }],
    });
    usePagedVendorsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "vendor-1",
            name: "Lab Supply Co.",
            contact_info: "Sarah Khan",
            email: "sarah@labsupply.test",
            phone: "+92-300-0000000",
            address: "12 Science Road",
            office_id: "office-1",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-02-02T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        limit: 60,
      },
      isLoading: false,
    });
    useVendorMock.mockImplementation((id: string) =>
      id
        ? {
            data: {
              id,
              name: "Lab Supply Co.",
              contact_info: "Sarah Khan",
              email: "sarah@labsupply.test",
              phone: "+92-300-0000000",
              address: "12 Science Road",
              office_id: "office-1",
              created_at: "2026-02-01T00:00:00.000Z",
              updated_at: "2026-02-02T00:00:00.000Z",
            },
            isLoading: false,
            isError: false,
          }
        : {
            data: undefined,
            isLoading: false,
            isError: false,
          }
    );
    useCreateVendorMock.mockReturnValue({ mutateAsync: vi.fn() });
    useUpdateVendorMock.mockReturnValue({ mutateAsync: vi.fn() });
    useDeleteVendorMock.mockReturnValue({ mutate: vi.fn() });
  });

  it("should open a real vendor details dialog when View Details is clicked", async () => {
    render(<Vendors />);

    await userEvent.click(screen.getByRole("button", { name: /view details/i }));

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Review supplier contact details and office assignment.")).toBeInTheDocument();
    expect(within(dialog).getByText("Lab Supply Co.")).toBeInTheDocument();
    expect(within(dialog).getByText("Sarah Khan")).toBeInTheDocument();
    expect(within(dialog).getByText("12 Science Road")).toBeInTheDocument();
    expect(within(dialog).getByText("Central Lab")).toBeInTheDocument();
  });
});
