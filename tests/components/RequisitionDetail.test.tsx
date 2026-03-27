/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const useAuthMock = vi.fn();
const useLocationsMock = vi.fn();
const useOfficeSubLocationsMock = vi.fn();
const useRequisitionDetailMock = vi.fn();
const requisitionVerifyMutateMock = vi.fn();
const useRequisitionAssignmentsMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: { from: "/requisitions" } }),
    useParams: () => ({ id: "req-1" }),
  };
});

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
vi.mock("@/hooks/useAssets", () => ({ useAssets: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useConsumableItems", () => ({ useConsumableItems: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useAssetItems", () => ({ useAssetItemsByLocation: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useAssignments", () => ({
  useRequestReturn: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadSignedHandoverSlip: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadSignedReturnSlip: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useRequisitions", () => ({
  useRequisitionDetail: (id: string, options: unknown) => useRequisitionDetailMock(id, options),
  useRequisitionAssignments: (id: string, options: unknown) => useRequisitionAssignmentsMock(id, options),
  useVerifyRequisition: () => ({ mutate: requisitionVerifyMutateMock, isPending: false }),
  useMapRequisitionLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFulfillRequisition: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/lib/api", () => ({ buildApiUrl: (value: string | null) => value }));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
  },
}));

import RequisitionDetail from "../../client/src/pages/RequisitionDetail";

describe("RequisitionDetail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "office_head" });
    useLocationsMock.mockReturnValue({ data: [{ id: "office-1", type: "DISTRICT_OFFICE", name: "Office One" }] });
    useOfficeSubLocationsMock.mockReturnValue({ data: [] });
    useRequisitionDetailMock.mockReturnValue({
      data: {
        requisition: { id: "req-1", file_number: "REQ-1", office_id: "office-1", status: "SUBMITTED", target_type: "EMPLOYEE", target_id: "employee-1", created_at: "2026-03-01T00:00:00.000Z" },
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
      },
      isLoading: false,
      isError: false,
    });
    useRequisitionAssignmentsMock.mockReturnValue({ data: [], isLoading: false });
    requisitionVerifyMutateMock.mockImplementation(
      (_payload: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.()
    );
  });

  it("should render a loading state while the requisition is loading", () => {
    useRequisitionDetailMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<RequisitionDetail />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("should allow office heads to approve submitted requisitions", async () => {
    render(<RequisitionDetail />);

    await userEvent.click(screen.getByRole("button", { name: /approve requisition/i }));

    await waitFor(() => {
      expect(requisitionVerifyMutateMock).toHaveBeenCalledWith(
        { decision: "VERIFY", remarks: undefined },
        expect.any(Object)
      );
    });
  });

  it("should require remarks before allowing rejection", async () => {
    render(<RequisitionDetail />);

    await userEvent.click(screen.getByRole("button", { name: /reject invalid/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm reject/i }));

    expect(toastErrorMock).toHaveBeenCalledWith("Reject remarks are required.");
    expect(requisitionVerifyMutateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ decision: "REJECT" }),
      expect.anything()
    );
  });
});
