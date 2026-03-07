/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const useQueryMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const useAssignmentsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useAssetItemsMock = vi.fn();
const useAssetsMock = vi.fn();
const useLocationsMock = vi.fn();
const useAuthMock = vi.fn();
const returnRequestCreateMock = vi.fn();
const returnRequestGetByIdMock = vi.fn();
const returnRequestReceiveMock = vi.fn();
const returnRequestUploadSignedMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: "return-1" }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => useQueryMock(config),
  useMutation: (config: {
    mutationFn: (variables?: any) => Promise<unknown>;
    onSuccess?: (data: unknown) => void | Promise<void>;
    onError?: (error: Error) => void;
  }) => ({
    isPending: false,
    mutate: async (variables?: unknown) => {
      try {
        const result = await config.mutationFn(variables);
        await config.onSuccess?.(result);
        return result;
      } catch (error) {
        config.onError?.(error as Error);
      }
    },
    mutateAsync: async (variables?: unknown) => {
      try {
        const result = await config.mutationFn(variables);
        await config.onSuccess?.(result);
        return result;
      } catch (error) {
        config.onError?.(error as Error);
        throw error;
      }
    },
  }),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

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

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, disabled }: { checked?: boolean; onCheckedChange?: (value: boolean) => void; disabled?: boolean }) => (
    <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/hooks/useAssignments", () => ({ useAssignments: () => useAssignmentsMock() }));
vi.mock("@/hooks/useEmployees", () => ({ useEmployees: () => useEmployeesMock() }));
vi.mock("@/hooks/useAssetItems", () => ({ useAssetItems: () => useAssetItemsMock() }));
vi.mock("@/hooks/useAssets", () => ({ useAssets: () => useAssetsMock() }));
vi.mock("@/hooks/useLocations", () => ({ useLocations: () => useLocationsMock() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/api", () => ({ buildApiUrl: (value: string | null) => value }));

vi.mock("@/services/returnRequestService", () => ({
  returnRequestService: {
    create: (...args: unknown[]) => returnRequestCreateMock(...args),
    list: vi.fn(),
    getById: (...args: unknown[]) => returnRequestGetByIdMock(...args),
    receive: (...args: unknown[]) => returnRequestReceiveMock(...args),
    uploadSignedReturn: (...args: unknown[]) => returnRequestUploadSignedMock(...args),
  },
}));

import ReturnRequestNew from "../../client/src/pages/ReturnRequestNew";
import ReturnDetail from "../../client/src/pages/ReturnDetail";

describe("return request flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "employee@test.com" },
      role: "employee",
      locationId: "office-1",
    });
    useAssignmentsMock.mockReturnValue({
      data: [
        {
          id: "assignment-1",
          employee_id: "employee-1",
          asset_item_id: "asset-item-1",
          assigned_date: "2026-03-01T00:00:00.000Z",
          is_active: true,
        },
      ],
      isLoading: false,
    });
    useEmployeesMock.mockReturnValue({
      data: [
        {
          id: "employee-1",
          user_id: "user-1",
          email: "employee@test.com",
          first_name: "Test",
          last_name: "Employee",
          location_id: "office-1",
        },
      ],
      refetch: vi.fn(),
    });
    useAssetItemsMock.mockReturnValue({
      data: [
        {
          id: "asset-item-1",
          asset_id: "asset-1",
          tag: "TAG-001",
          serial_number: "SER-001",
        },
      ],
    });
    useAssetsMock.mockReturnValue({ data: [{ id: "asset-1", name: "Laptop" }] });
    useLocationsMock.mockReturnValue({ data: [{ id: "office-1", name: "Main Office" }] });
    returnRequestCreateMock.mockResolvedValue({ id: "return-1" });
    returnRequestGetByIdMock.mockReturnValue({
      returnRequest: {
        id: "return-1",
        status: "SUBMITTED",
        employee_id: "employee-1",
        office_id: "office-1",
        created_at: "2026-03-02T00:00:00.000Z",
      },
      lines: [{ asset_item_id: "asset-item-1" }],
      documents: { receiptDocument: null },
    });
    returnRequestReceiveMock.mockResolvedValue({});
    returnRequestUploadSignedMock.mockResolvedValue({});
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "return-request") {
        return { data: returnRequestGetByIdMock(), isLoading: false, isError: false };
      }
      return { data: undefined, isLoading: false, isError: false };
    });
  });

  it("should render a loading state while assignments are loading", () => {
    useAssignmentsMock.mockReturnValue({ data: [], isLoading: true });

    const { container } = render(<ReturnRequestNew />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("should submit a return request for selected assets and navigate to the detail page", async () => {
    render(<ReturnRequestNew />);

    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole("button", { name: /submit return request/i }));

    await waitFor(() => {
      expect(returnRequestCreateMock).toHaveBeenCalledWith({
        employeeId: "employee-1",
        officeId: "office-1",
        returnAll: false,
        assetItemIds: ["asset-item-1"],
      });
    });
    expect(navigateMock).toHaveBeenCalledWith("/returns/return-1");
  });

  it("should render an error state for an invalid return request detail", async () => {
    useAuthMock.mockReturnValue({ role: "employee", locationId: "office-1" });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "return-request") {
        return { data: undefined, isLoading: false, isError: true };
      }
      return { data: undefined, isLoading: false, isError: false };
    });

    render(<ReturnDetail />);

    expect(screen.getByText(/unable to load return request/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(navigateMock).toHaveBeenCalledWith("/assignments");
  });

  it("should allow issuers to receive a submitted return request", async () => {
    useAuthMock.mockReturnValue({ role: "office_head", locationId: "office-1" });

    render(<ReturnDetail />);

    await userEvent.click(screen.getByRole("button", { name: /receive \/ confirm return/i }));

    await waitFor(() => {
      expect(returnRequestReceiveMock).toHaveBeenCalledWith("return-1");
    });
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["return-request", "return-1"] });
  });
});
