/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
const detailMock = vi.fn();

vi.mock("@/hooks/useRecords", () => ({
  useRecordLookup: (...args: unknown[]) => lookupMock(...args),
  useRecordDetail: (...args: unknown[]) => detailMock(...args),
}));

import { RecordDetailModal } from "../../client/src/components/records/RecordDetailModal";

describe("RecordDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupMock.mockReturnValue({ isLoading: false, isFetched: false, data: null });
    detailMock.mockReturnValue({ isLoading: false, data: undefined });
  });

  it("should show a loading state while lookup or detail is loading", () => {
    lookupMock.mockReturnValue({ isLoading: true, isFetched: false, data: null });

    render(<RecordDetailModal open onOpenChange={vi.fn()} lookup={{ transferId: "transfer-1" }} />);

    expect(screen.getByText(/loading record file/i)).toBeInTheDocument();
  });

  it("should show an empty state when no linked record is found", () => {
    lookupMock.mockReturnValue({ isLoading: false, isFetched: true, data: null });

    render(<RecordDetailModal open onOpenChange={vi.fn()} lookup={{ transferId: "transfer-1" }} />);

    expect(screen.getByText(/no linked record found yet/i)).toBeInTheDocument();
  });

  it("should render record details, highlighted documents, approvals, and audit trail", async () => {
    lookupMock.mockReturnValue({ isLoading: false, isFetched: true, data: { id: "record-1" } });
    detailMock.mockReturnValue({
      isLoading: false,
      data: {
        record: {
          id: "record-1",
          reference_no: "REC-001",
          record_type: "Transfer",
          created_at: "2026-03-01T12:00:00.000Z",
          status: "Pending",
          notes: "Needs approval",
        },
        missingRequirements: ["Takeover report"],
        documents: [
          {
            document: { id: "doc-2", title: "Other Doc", doc_type: "Invoice", status: "Final" },
            links: [],
            versions: [],
          },
          {
            document: { id: "doc-1", title: "Transfer Challan", doc_type: "TransferChallan", status: "Final" },
            links: [{ id: "link-1" }],
            versions: [
              {
                id: "version-1",
                version_no: 1,
                file_name: "challan.pdf",
                size_bytes: 4096,
                uploaded_at: "2026-03-01T13:00:00.000Z",
                file_url: "/api/documents/versions/version-1/download",
              },
            ],
          },
        ],
        approvals: [
          {
            id: "approval-1",
            status: "Pending",
            approver_role: "office_head",
            requested_at: "2026-03-01T12:30:00.000Z",
          },
        ],
        auditLogs: [
          {
            id: "audit-1",
            action: "CREATE_RECORD",
            entity_type: "Record",
            entity_id: "record-1",
            timestamp: "2026-03-01T12:00:00.000Z",
          },
        ],
      },
    });

    render(
      <RecordDetailModal
        open
        onOpenChange={vi.fn()}
        lookup={{ transferId: "transfer-1" }}
        title="Transfer File"
        highlightDocType="TransferChallan"
      />
    );

    expect(screen.getByText("REC-001")).toBeInTheDocument();
    expect(screen.getByText("Needs approval")).toBeInTheDocument();
    expect(screen.getByText("Takeover report")).toBeInTheDocument();
    expect(screen.getByText("Transfer Challan")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view file/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/documents/versions/version-1/download")
    );
    expect(screen.getByText("Role: office_head")).toBeInTheDocument();
    expect(screen.getByText("CREATE_RECORD")).toBeInTheDocument();
  });

  it("should render satisfied and empty informational states when no documents, approvals, or audit logs exist", () => {
    lookupMock.mockReturnValue({ isLoading: false, isFetched: true, data: { id: "record-1" } });
    detailMock.mockReturnValue({
      isLoading: false,
      data: {
        record: {
          id: "record-1",
          reference_no: "REC-002",
          record_type: "Assignment",
          created_at: "2026-03-01T12:00:00.000Z",
          status: "Complete",
          notes: "",
        },
        missingRequirements: [],
        documents: [],
        approvals: [],
        auditLogs: [],
      },
    });

    render(<RecordDetailModal open onOpenChange={vi.fn()} lookup={{ assignmentId: "assignment-1" }} />);

    expect(screen.getByText(/all requirements satisfied/i)).toBeInTheDocument();
    expect(screen.getByText(/no documents linked yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no approval requests recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/no audit activity yet/i)).toBeInTheDocument();
  });
});
