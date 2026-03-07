/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
const toastErrorMock = vi.fn();
const useTransfersMock = vi.fn();
const useCreateTransferMock = vi.fn();
const useTransferActionMock = vi.fn();
const useAssetItemsMock = vi.fn();
const useAssetsMock = vi.fn();
const useLocationsMock = vi.fn();
const useAuthMock = vi.fn();
const documentCreateMock = vi.fn();
const documentUploadMock = vi.fn();
const documentLinkCreateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
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
  DataTable: ({ data, actions }: { data: Array<Record<string, unknown>>; actions?: (row: Record<string, unknown>) => React.ReactNode }) => (
    <div>
      {data.map((row) => (
        <div key={String(row.id)}>
          <span>{String(row.assetsPreview)}</span>
          {actions?.(row)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("@/components/records/RecordDetailModal", () => ({
  RecordDetailModal: ({ open, title }: { open: boolean; title: string }) => open ? <div role="dialog">{title}</div> : null,
}));

vi.mock("@/components/shared/SearchableSelect", () => ({
  SearchableSelect: ({ id, value, onValueChange, options, disabled }: {
    id?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    options?: Array<{ value: string; label: string }>;
    disabled?: boolean;
  }) => (
    <select aria-label={id || "select"} value={value || ""} disabled={disabled} onChange={(e) => onValueChange?.(e.target.value)}>
      <option value="">Select</option>
      {(options || []).map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ value, onValueChange, placeholder }: { value?: string; onValueChange?: (value: string) => void; placeholder?: string }) => (
    <input aria-label={placeholder || "command-input"} value={value || ""} onChange={(e) => onValueChange?.(e.target.value)} />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>{children}</button>
  ),
}));

vi.mock("@/hooks/useTransfers", () => ({
  useTransfers: () => useTransfersMock(),
  useCreateTransfer: () => useCreateTransferMock(),
  useTransferAction: () => useTransferActionMock(),
}));

vi.mock("@/hooks/useAssetItems", () => ({
  useAssetItems: () => useAssetItemsMock(),
}));

vi.mock("@/hooks/useAssets", () => ({
  useAssets: () => useAssetsMock(),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => useLocationsMock(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/services/documentService", () => ({
  documentService: {
    create: (...args: unknown[]) => documentCreateMock(...args),
    upload: (...args: unknown[]) => documentUploadMock(...args),
  },
}));

vi.mock("@/services/documentLinkService", () => ({
  documentLinkService: {
    create: (...args: unknown[]) => documentLinkCreateMock(...args),
  },
}));

import Transfers from "../../client/src/pages/Transfers";

describe("Transfers page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "office_head", isOrgAdmin: false, locationId: "office-1" });
    useLocationsMock.mockReturnValue({
      data: [
        { id: "office-1", name: "Office One" },
        { id: "office-2", name: "Office Two" },
      ],
    });
    useAssetsMock.mockReturnValue({ data: [{ id: "asset-1", name: "Microscope" }] });
    useAssetItemsMock.mockReturnValue({
      data: [
        {
          id: "item-1",
          asset_id: "asset-1",
          tag: "TAG-001",
          serial_number: "SER-001",
          assignment_status: "Unassigned",
          item_status: "Available",
          holder_type: "OFFICE",
          holder_id: "office-1",
        },
      ],
    });
    useTransfersMock.mockReturnValue({
      data: [
        {
          id: "transfer-1",
          status: "REQUESTED",
          lines: [{ asset_item_id: "item-1" }],
          from_office_id: "office-1",
          to_office_id: "office-2",
          transfer_date: "2026-03-01T00:00:00.000Z",
          notes: "Move to lab",
        },
      ],
      isLoading: false,
    });
    useCreateTransferMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({ id: "transfer-2" }) });
    useTransferActionMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}), mutate: vi.fn() });
    documentCreateMock.mockResolvedValue({ id: "doc-1" });
    documentUploadMock.mockResolvedValue({});
    documentLinkCreateMock.mockResolvedValue({});
  });

  it("should render a loading state while transfers are loading", () => {
    useTransfersMock.mockReturnValue({ data: [], isLoading: true });

    const { container } = render(<Transfers />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("should show read-only access for non-managing roles", () => {
    useAuthMock.mockReturnValue({ role: "employee", isOrgAdmin: false, locationId: "office-1" });

    render(<Transfers />);

    expect(screen.getByText(/read-only access to transfer records/i)).toBeInTheDocument();
  });

  it("should validate transfer creation requirements and surface toast errors", async () => {
    render(<Transfers />);

    await userEvent.click(screen.getByRole("button", { name: /create transfer request/i }));
    expect(toastErrorMock).toHaveBeenCalledWith("From and destination offices are required");

    await userEvent.selectOptions(screen.getByLabelText(/toOffice/i), "office-2");
    await userEvent.click(screen.getByRole("button", { name: /create transfer request/i }));
    expect(toastErrorMock).toHaveBeenCalledWith("Select at least one asset item");
  });

  it("should create a transfer with approval-order upload and linked document", async () => {
    const createTransfer = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ id: "transfer-2" }) };
    useCreateTransferMock.mockReturnValue(createTransfer);

    render(<Transfers />);

    await userEvent.selectOptions(screen.getByLabelText(/toOffice/i), "office-2");
    await userEvent.click(screen.getByRole("button", { name: /tag-001/i }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!fileInput) {
      throw new Error("Expected approval order file input to render");
    }
    await userEvent.upload(fileInput, new File(["pdf-content"], "approval.pdf", { type: "application/pdf" }));
    await userEvent.type(screen.getByLabelText(/notes/i), "Urgent transfer");
    await userEvent.click(screen.getByRole("button", { name: /create transfer request/i }));

    await waitFor(() => {
      expect(documentCreateMock).toHaveBeenCalledWith(expect.objectContaining({ officeId: "office-1" }));
    });
    expect(documentUploadMock).toHaveBeenCalledWith("doc-1", expect.any(File));
    expect(createTransfer.mutateAsync).toHaveBeenCalledWith({
      fromOfficeId: "office-1",
      toOfficeId: "office-2",
      approvalOrderDocumentId: "doc-1",
      lines: [{ assetItemId: "item-1" }],
      notes: "Urgent transfer",
    });
    expect(documentLinkCreateMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      entityType: "Transfer",
      entityId: "transfer-2",
      requiredForStatus: "Approved",
    });
  });

  it("should open the transfer file dialog and run row actions", async () => {
    const transferAction = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}), mutate: vi.fn() };
    useTransferActionMock.mockReturnValue(transferAction);

    render(<Transfers />);

    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(navigateMock).toHaveBeenCalledWith("/transfers/transfer-1");

    await userEvent.click(screen.getByRole("button", { name: /file/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(/transfer file - transfer transfer-1/i);

    await userEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(transferAction.mutateAsync).toHaveBeenCalledWith({ id: "transfer-1", action: "approve" });

    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    expect(transferAction.mutate).toHaveBeenCalledWith({ id: "transfer-1", action: "reject" });

    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(transferAction.mutate).toHaveBeenCalledWith({ id: "transfer-1", action: "cancel" });
  });
});
