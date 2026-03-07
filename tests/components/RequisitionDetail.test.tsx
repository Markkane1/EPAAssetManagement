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
const useAuthMock = vi.fn();
const useLocationsMock = vi.fn();
const useOfficeSubLocationsMock = vi.fn();
const requisitionVerifyMock = vi.fn();
const requisitionFulfillMock = vi.fn();
const requisitionGetByIdMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: { from: "/requisitions" } }),
    useParams: () => ({ id: "req-1" }),
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

vi.mock("@/components/layout/MainLayout", () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onClick: () => void } }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {action ? <button type="button" onClick={action.onClick}>{action.label}</button> : null}
    </div>
  ),
}));
vi.mock("@/components/shared/StatusBadge", () => ({ StatusBadge: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock("@/components/shared/SearchableSelect", () => ({
  SearchableSelect: ({ value, onValueChange, options }: { value?: string; onValueChange?: (value: string) => void; options?: Array<{ value: string; label: string }> }) => (
    <select aria-label="searchable-select" value={value || ""} onChange={(e) => onValueChange?.(e.target.value)}>
      <option value="">Select</option>
      {(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));
vi.mock("@/hooks/useLocations", () => ({ useLocations: () => useLocationsMock() }));
vi.mock("@/hooks/useOfficeSubLocations", () => ({ useOfficeSubLocations: () => useOfficeSubLocationsMock() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/api", () => ({ buildApiUrl: (value: string | null) => value }));

vi.mock("@/services/requisitionService", () => ({
  requisitionService: {
    getById: (...args: unknown[]) => requisitionGetByIdMock(...args),
    verify: (...args: unknown[]) => requisitionVerifyMock(...args),
    fulfill: (...args: unknown[]) => requisitionFulfillMock(...args),
    mapLine: vi.fn(),
    uploadSignedIssuance: vi.fn(),
    adjust: vi.fn(),
    downloadIssuanceReportPdf: vi.fn(),
  },
}));
vi.mock("@/services/assignmentService", () => ({ assignmentService: { getAll: vi.fn().mockResolvedValue([]), downloadHandoverSlipPdf: vi.fn(), uploadSignedHandoverSlip: vi.fn(), requestReturn: vi.fn(), downloadReturnSlipPdf: vi.fn(), uploadSignedReturnSlip: vi.fn() } }));
vi.mock("@/services/assetService", () => ({ assetService: { getAll: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/consumableItemService", () => ({ consumableItemService: { getAll: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/assetItemService", () => ({ assetItemService: { getByLocation: vi.fn().mockResolvedValue([]) } }));

import RequisitionDetail from "../../client/src/pages/RequisitionDetail";

describe("RequisitionDetail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "office_head" });
    useLocationsMock.mockReturnValue({ data: [{ id: "office-1", type: "DISTRICT_OFFICE", name: "Office One" }] });
    useOfficeSubLocationsMock.mockReturnValue({ data: [] });
    requisitionGetByIdMock.mockReturnValue({
      requisition: { id: "req-1", office_id: "office-1", status: "SUBMITTED", target_type: "EMPLOYEE", target_id: "employee-1" },
      lines: [
        {
          id: "line-1",
          line_type: "CONSUMABLE",
          requested_name: "Gloves",
          requested_quantity: 2,
          approved_quantity: 2,
          fulfilled_quantity: 0,
        },
      ],
      documents: { requisitionForm: null, issueSlip: null },
    });
    requisitionVerifyMock.mockResolvedValue({ status: "VERIFIED_APPROVED" });
    requisitionFulfillMock.mockResolvedValue({});
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "requisition") {
        return { data: requisitionGetByIdMock(), isLoading: false, isError: false };
      }
      return { data: [], isLoading: false, isError: false };
    });
  });

  it("should render a loading state while the requisition is loading", () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "requisition") {
        return { data: undefined, isLoading: true, isError: false };
      }
      return { data: [], isLoading: false, isError: false };
    });

    const { container } = render(<RequisitionDetail />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("should allow office heads to approve submitted requisitions", async () => {
    render(<RequisitionDetail />);

    await userEvent.click(screen.getByRole("button", { name: /approve requisition/i }));

    await waitFor(() => {
      expect(requisitionVerifyMock).toHaveBeenCalledWith("req-1", { decision: "VERIFY", remarks: undefined });
    });
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["requisitions"] });
  });

  it("should require remarks before allowing rejection", async () => {
    render(<RequisitionDetail />);

    await userEvent.click(screen.getByRole("button", { name: /reject invalid/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm reject/i }));

    expect(toastErrorMock).toHaveBeenCalledWith("Reject remarks are required.");
    expect(requisitionVerifyMock).not.toHaveBeenCalledWith("req-1", expect.objectContaining({ decision: "REJECT" }));
  });
});
