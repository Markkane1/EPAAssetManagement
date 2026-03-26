/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const navigateMock = vi.fn();
const apiPostMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const markAllReadMutateMock = vi.fn();
const markReadMutateMock = vi.fn();
const notificationActionMutateMock = vi.fn();
const updateSettingsMutateAsyncMock = vi.fn();
const backupDataMutateAsyncMock = vi.fn();
const testEmailMutateAsyncMock = vi.fn();
const createDelegationMutateAsyncMock = vi.fn();
const revokeDelegationMutateMock = vi.fn();
const requisitionCreateMock = vi.fn();
const consumeConsumablesMutateAsyncMock = vi.fn();
const exportToCSVMock = vi.fn();
const exportToJSONMock = vi.fn();
const pageSearchSetTermMock = vi.fn();

const locations = [
  { id: "office-1", name: "Head Office", type: "HEAD_OFFICE", capabilities: { consumables: true, chemicals: true } },
  { id: "office-2", name: "District Lab", type: "DISTRICT_LAB", capabilities: { consumables: true, chemicals: true } },
];
const employees = [
  { id: "employee-1", user_id: "user-1", first_name: "Ava", last_name: "Admin", email: "ava@example.com", location_id: "office-1", directorate_id: "directorate-1", is_active: true },
  { id: "employee-2", user_id: "user-2", first_name: "Ben", last_name: "Officer", email: "ben@example.com", location_id: "office-1", directorate_id: "directorate-1", is_active: true },
];
const assets = [{ id: "asset-1", name: "Laptop" }];
const assetItems = [{ id: "item-1", asset_id: "asset-1", tag: "TAG-1", serial_number: "SER-1", item_status: "AVAILABLE", assignment_status: "ASSIGNED", office_id: "office-1", holder_id: "office-1", holder_type: "OFFICE" }];
const assignments = [{ id: "assignment-1", asset_item_id: "item-1", employee_id: "employee-1", assigned_date: "2026-03-01T00:00:00.000Z", is_active: true, status: "ACTIVE", notes: "Assigned" }];
const notifications = [{ id: "note-1", title: "Approval needed", message: "Review requisition", type: "REQUISITION_APPROVAL", is_read: false, created_at: "2026-03-07T00:00:00.000Z", available_actions: ["APPROVE", "ACKNOWLEDGE"], open_path: "/requisitions/req-1" }];
const roomSections = [{ id: "section-1", name: "Room A", office_id: "office-1" }];
const balances = [{ id: "balance-1", holder_type: "EMPLOYEE", holder_id: "employee-1", consumable_item_id: "consumable-1", qty_on_hand_base: 4, qty_reserved_base: 1, lot_id: "lot-1" }];
const consumableItems = [{ id: "consumable-1", name: "Acid", base_uom: "L" }];
const lots = [{ id: "lot-1", batch_no: "LOT-1" }];
const activities = [{ id: "activity-1", activity_type: "login", user_id: "user-1", user_name: "Ava Admin", user_email: "ava@example.com", description: "Logged in", user_agent: "Chrome", created_at: "2026-03-07T00:00:00.000Z" }];
const auditLogs = [{ id: "audit-1", timestamp: "2026-03-07T00:00:00.000Z", userEmail: "ava@example.com", action: "LOGIN_SUCCESS", category: "auth", details: "Success", status: "success", resource: "login" }];
const settingsPayload = {
  settings: {
    organization: { name: "EPA", code: "EPA", address: "Addr", email: "epa@test.com", phone: "123" },
    notifications: {
      low_stock_alerts: true,
      maintenance_reminders: true,
      assignment_notifications: true,
      warranty_expiry_alerts: false,
    },
    security: { session_timeout_minutes: 60, password_rotation_days: 90, require_mfa: false },
  },
  systemInfo: {
    storage_used_bytes: 1024,
    storage_limit_bytes: 2048,
    last_backup_at: "2026-03-07T00:00:00.000Z",
    api_base_url: "http://localhost:5000/api",
  },
};
const activityPageData = { items: activities, total: activities.length, page: 1, limit: 50 };
const transfer = {
  id: "transfer-1",
  status: "PENDING",
  from_office_id: "office-1",
  to_office_id: "office-2",
  transfer_date: "2026-03-07T00:00:00.000Z",
  lines: [{ asset_item_id: "item-1", notes: "Handle carefully" }],
  store_id: "store-1",
  notes: "Transfer notes",
  created_at: "2026-03-07T00:00:00.000Z",
  updated_at: "2026-03-07T01:00:00.000Z",
};
const complianceResponse = {
  page: 1,
  limit: 1000,
  total: 2,
  officeId: null,
  counts: { requisitionsWithoutSignedIssueSlip: 1, returnRequestsWithoutSignedReturnSlip: 1, total: 2 },
  items: [
    { type: "REQUISITION", issue: "MISSING_SIGNED_ISSUE_SLIP", id: "req-1", office_id: "office-1", status: "FULFILLED", file_number: "REQ-1", signed_document_id: null, created_at: "2026-03-01T00:00:00.000Z", updated_at: "2026-03-01T00:00:00.000Z" },
    { type: "RETURN_REQUEST", issue: "MISSING_SIGNED_RETURN_SLIP", id: "ret-1", office_id: "office-2", status: "RECEIVED", file_number: "RET-1", signed_document_id: null, created_at: "2026-03-02T00:00:00.000Z", updated_at: "2026-03-02T00:00:00.000Z" },
  ],
};

function findSelectItems(children: React.ReactNode): Array<{ value: string; label: React.ReactNode }> {
  const items: Array<{ value: string; label: React.ReactNode }> = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if ((child.type as { displayName?: string }).displayName === "SelectItem") {
      items.push({ value: String(child.props.value), label: child.props.children });
      return;
    }
    if (child.props?.children) {
      items.push(...findSelectItems(child.props.children));
    }
  });
  return items;
}

function makeMutation({ onMutateAsync, onMutate }: { onMutateAsync?: (...args: any[]) => any; onMutate?: (...args: any[]) => any } = {}) {
  return {
    isPending: false,
    mutateAsync: async (...args: any[]) => onMutateAsync?.(...args),
    mutate: (...args: any[]) => onMutate?.(...args),
  };
}

function makeModal(testId: string) {
  return ({ open, children }: { open?: boolean; children?: React.ReactNode }) => (open ? <div data-testid={testId}>{children}</div> : null);
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: "transfer-1" }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryFn }: { queryFn?: () => unknown }) => ({ data: queryFn ? queryFn() : undefined, isLoading: false, isError: false }),
  useMutation: () => makeMutation(),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => toastSuccessMock(...args), error: (...args: unknown[]) => toastErrorMock(...args) } }));
vi.mock("@/lib/api", () => ({ default: { post: (...args: unknown[]) => apiPostMock(...args) }, API_BASE_URL: "/api" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "org_admin", isOrgAdmin: true, locationId: "office-1", user: { id: "user-1", email: "ava@example.com" } }) }));
vi.mock("@/contexts/PageSearchContext", () => ({ usePageSearch: () => ({ term: "", setTerm: pageSearchSetTermMock }) }));
vi.mock("@/hooks/useDashboard", () => ({
  useDashboardMe: () => ({
    data: { employeeId: "employee-1", employee: employees[0], openRequisitionsCount: 0, openReturnsCount: 0 },
    isLoading: false,
  }),
}));
vi.mock("@/components/layout/MainLayout", () => ({ MainLayout: ({ title, description, children }: any) => <div><h1>{title}</h1><p>{description}</p>{children}</div> }));
vi.mock("@/components/shared/PageHeader", () => ({ PageHeader: ({ title, description, action, extra }: any) => <div><h2>{title}</h2><p>{description}</p>{action ? <button type="button" onClick={action.onClick}>{action.label}</button> : null}{extra}</div> }));
vi.mock("@/components/shared/StatusBadge", () => ({ StatusBadge: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock("@/components/shared/SearchableSelect", () => ({ SearchableSelect: ({ value = "", onValueChange, options = [], placeholder }: any) => <select aria-label={placeholder || "searchable-select"} value={value} onChange={(e) => onValueChange?.(e.target.value)}>{options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));
vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({ data = [], columns = [], actions }: any) => (
    <div data-testid="data-table">
      {data.length === 0 ? <span>No rows</span> : null}
      {data.map((row: any) => (
        <div key={row.id}>
          {columns.map((column: any) => <div key={column.key}>{column.render ? column.render(row[column.key], row) : String(row[column.key] ?? "")}</div>)}
          {actions ? <div>{actions(row)}</div> : null}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/forms/AssignmentFormModal", () => ({ AssignmentFormModal: makeModal("assignment-form-modal") }));
vi.mock("@/components/forms/ReassignmentFormModal", () => ({ ReassignmentFormModal: makeModal("reassignment-form-modal") }));
vi.mock("@/components/forms/ReturnFormModal", () => ({ ReturnFormModal: makeModal("return-form-modal") }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, type = "button", ...props }: any) => <button type={type} onClick={onClick} {...props}>{children}</button> }));
vi.mock("@/components/ui/input", () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label> }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (props: any) => <textarea {...props} /> }));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: ({ checked, onCheckedChange }: any) => <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onCheckedChange?.(e.target.checked)} /> }));
vi.mock("@/components/ui/switch", () => ({ Switch: ({ checked, onCheckedChange, id }: any) => <input aria-label={id || "switch"} type="checkbox" checked={Boolean(checked)} onChange={(e) => onCheckedChange?.(e.target.checked)} /> }));
vi.mock("@/components/ui/separator", () => ({ Separator: () => <hr /> }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: any) => <div>{children}</div>, CardHeader: ({ children }: any) => <div>{children}</div>, CardContent: ({ children }: any) => <div>{children}</div>, CardTitle: ({ children }: any) => <div>{children}</div>, CardDescription: ({ children }: any) => <div>{children}</div>, CardFooter: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui/alert", () => ({ Alert: ({ children }: any) => <div>{children}</div>, AlertTitle: ({ children }: any) => <div>{children}</div>, AlertDescription: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null, DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <div>{children}</div>, DialogDescription: ({ children }: any) => <div>{children}</div>, DialogFooter: ({ children }: any) => <div>{children}</div>, DialogTrigger: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui/dropdown-menu", () => ({ DropdownMenu: ({ children }: any) => <div>{children}</div>, DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>, DropdownMenuContent: ({ children }: any) => <div>{children}</div>, DropdownMenuItem: ({ children, onClick }: any) => <button type="button" onClick={onClick}>{children}</button>, DropdownMenuSeparator: () => <hr /> }));
vi.mock("@/components/ui/table", () => ({ Table: ({ children }: any) => <table>{children}</table>, TableHeader: ({ children }: any) => <thead>{children}</thead>, TableBody: ({ children }: any) => <tbody>{children}</tbody>, TableRow: ({ children }: any) => <tr>{children}</tr>, TableHead: ({ children }: any) => <th>{children}</th>, TableCell: ({ children, colSpan }: any) => <td colSpan={colSpan}>{children}</td> }));
vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<any>({ items: [] });
  const Select = ({ value, onValueChange, children }: any) => <SelectContext.Provider value={{ value, onValueChange, items: findSelectItems(children) }}><div>{children}</div></SelectContext.Provider>;
  const SelectTrigger = () => {
    const ctx = React.useContext(SelectContext);
    return <select aria-label="select-trigger" value={ctx.value || ""} onChange={(e) => ctx.onValueChange?.(e.target.value)}><option value="">Select</option>{ctx.items.map((item: any) => <option key={item.value} value={item.value}>{item.value}</option>)}</select>;
  };
  const SelectContent = ({ children }: any) => <div>{children}</div>;
  const SelectItem = ({ children, value }: any) => <div data-value={value}>{children}</div>;
  (SelectItem as any).displayName = "SelectItem";
  const SelectValue = () => null;
  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});

vi.mock("@/hooks/useSettings", () => ({
  useSystemSettings: () => ({ data: settingsPayload, isLoading: false }),
  useUpdateSystemSettings: () => makeMutation({ onMutateAsync: (...args) => updateSettingsMutateAsyncMock(...args) }),
  useBackupData: () => makeMutation({ onMutateAsync: (...args) => backupDataMutateAsyncMock(...args) }),
  useTestEmail: () => makeMutation({ onMutateAsync: (...args) => testEmailMutateAsyncMock(...args) }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: ({ unreadOnly }: any = {}) => ({ data: unreadOnly ? { data: notifications, total: 1, page: 1, limit: 1 } : { data: notifications, total: 1, page: 1, limit: 50 }, isLoading: false }),
  useMarkAllNotificationsRead: () => makeMutation({ onMutate: (...args) => markAllReadMutateMock(...args) }),
  useMarkNotificationRead: () => makeMutation({ onMutate: (...args) => markReadMutateMock(...args) }),
  useNotificationAction: () => ({ isPending: false, mutate: (payload: any, options?: any) => { notificationActionMutateMock(payload); if (payload.action === "OPEN_RECORD") { options?.onSuccess?.({ openPath: "/requisitions/req-1" }); return; } options?.onSuccess?.({}); } }),
}));
vi.mock("@/hooks/useLocations", () => ({ useLocations: () => ({ data: locations, isLoading: false }) }));
vi.mock("@/hooks/useEmployees", () => ({ useEmployees: () => ({ data: employees, isLoading: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/useRoleDelegations", () => ({
  useRoleDelegations: () => ({ data: [{ id: "delegation-1", delegate_email: "ben@example.com", delegate_user_id: "user-2", delegator_email: "ava@example.com", delegator_user_id: "user-1", delegated_roles: ["employee"], starts_at: "2026-03-07T00:00:00.000Z", ends_at: "2026-03-08T00:00:00.000Z", status: "ACTIVE", is_currently_active: true, reason: "Cover" }], isLoading: false }),
  useCreateRoleDelegation: () => makeMutation({ onMutateAsync: (...args) => createDelegationMutateAsyncMock(...args) }),
  useRevokeRoleDelegation: () => makeMutation({ onMutate: (...args) => revokeDelegationMutateMock(...args) }),
}));
vi.mock("@/services/requisitionService", () => ({ requisitionService: { create: (...args: unknown[]) => requisitionCreateMock(...args) } }));
vi.mock("@/hooks/useOfficeSubLocations", () => ({ useOfficeSubLocations: () => ({ data: roomSections, isLoading: false }) }));
vi.mock("@/hooks/useTransfers", () => ({ useTransfer: () => ({ data: transfer, isLoading: false, isError: false }) }));
vi.mock("@/hooks/useAssetItems", () => ({ useAssetItems: () => ({ data: assetItems, isLoading: false }) }));
vi.mock("@/hooks/useAssets", () => ({ useAssets: () => ({ data: assets, isLoading: false }) }));
vi.mock("@/hooks/useAssignments", () => ({
  useAssignments: () => ({ data: assignments, isLoading: false }),
  usePagedAssignments: () => ({
    data: { items: assignments, total: assignments.length, page: 1, limit: 100 },
    isLoading: false,
  }),
  useCreateAssignment: () => makeMutation(),
  useRequestReturn: () => makeMutation(),
  useReassignAsset: () => makeMutation(),
  useAssignmentsByEmployee: () => ({ data: assignments, isLoading: false }),
}));
vi.mock("@/hooks/useConsumableInventory", () => ({ useConsumableBalances: () => ({ data: balances, isLoading: false }), useConsumeConsumables: () => makeMutation({ onMutateAsync: (...args) => consumeConsumablesMutateAsyncMock(...args) }) }));
vi.mock("@/hooks/useConsumableItems", () => ({ useConsumableItems: () => ({ data: consumableItems, isLoading: false }) }));
vi.mock("@/hooks/useConsumableLots", () => ({ useConsumableLots: () => ({ data: lots, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/services/activityService", () => ({ activityService: { getPagedActivities: () => activityPageData } }));
vi.mock("@/lib/exportUtils", () => ({ exportToCSV: (...args: unknown[]) => exportToCSVMock(...args), exportToJSON: (...args: unknown[]) => exportToJSONMock(...args), formatDateForExport: (value: string) => value }));
vi.mock("@/lib/auditLog", () => ({ getAuditLogs: () => auditLogs }));
vi.mock("@/services/reportService", () => ({ reportService: { getNonCompliance: () => complianceResponse } }));
vi.mock("@/lib/locationUtils", () => ({ isHeadOfficeLocation: () => true }));
vi.mock("@/lib/assetItemHolder", () => ({ getOfficeHolderId: (item: any) => item.holder_id || item.office_id, isStoreHolder: (item: any) => item.holder_type === "STORE" }));

async function renderPage(modulePath: string) {
  cleanup();
  const pageModule = await import(modulePath);
  const Component = pageModule.default;
  return render(
    <MemoryRouter future={routerFuture}>
      <Component />
    </MemoryRouter>
  );
}

describe("client page gap batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSettingsMutateAsyncMock.mockResolvedValue({});
    backupDataMutateAsyncMock.mockResolvedValue({ message: "Backup completed" });
    testEmailMutateAsyncMock.mockResolvedValue({ message: "Email sent" });
    requisitionCreateMock.mockResolvedValue({ requisition: { id: "req-1" } });
    consumeConsumablesMutateAsyncMock.mockResolvedValue({ ok: true });
    apiPostMock.mockResolvedValue({ ok: true });
  });

  it("should submit forgot password requests and render not found fallback", async () => {
    await renderPage("../../client/src/pages/ForgotPassword");
    await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com");
    await userEvent.click(screen.getByRole("button", { name: /request reset/i }));
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith("/auth/forgot-password", { email: "admin@example.com" }));

    await renderPage("../../client/src/pages/NotFound");
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });

  it("should handle notification actions, settings actions, and delegation revoke", async () => {
    await renderPage("../../client/src/pages/NotificationDetails");
    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    await userEvent.click(screen.getByRole("button", { name: /open record/i }));
    expect(markAllReadMutateMock).toHaveBeenCalled();
    expect(notificationActionMutateMock).toHaveBeenCalledWith({ id: "note-1", action: "APPROVE" });
    expect(navigateMock).toHaveBeenCalledWith("/requisitions/req-1");

    await renderPage("../../client/src/pages/Settings");
    const orgNameInput = screen.getByLabelText(/organization name/i);
    await userEvent.clear(orgNameInput);
    await userEvent.type(orgNameInput, "EPA Punjab");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateSettingsMutateAsyncMock).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /backup data/i }));
    await userEvent.click(screen.getByRole("button", { name: /test email/i }));
    await userEvent.click(screen.getByRole("button", { name: /view details/i }));
    expect(backupDataMutateAsyncMock).toHaveBeenCalled();
    expect(testEmailMutateAsyncMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/settings/notifications");

    await renderPage("../../client/src/pages/RoleDelegations");
    expect(screen.getByText(/delegation register/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /revoke/i }));
    expect(revokeDelegationMutateMock).toHaveBeenCalledWith("delegation-1");
  });

  it("should export activity and audit reports and show compliance rows", async () => {
    await renderPage("../../client/src/pages/UserActivity");
    await userEvent.click(screen.getByRole("button", { name: /^csv$/i }));
    expect(exportToCSVMock).toHaveBeenCalled();
    expect(screen.getAllByText(/activity log/i).length).toBeGreaterThan(0);

    await renderPage("../../client/src/pages/AuditLogs");
    await userEvent.click(screen.getByRole("button", { name: /^csv$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^json$/i }));
    expect(exportToCSVMock).toHaveBeenCalled();
    expect(exportToJSONMock).toHaveBeenCalled();

    await renderPage("../../client/src/pages/Compliance");
    expect(screen.getByText(/compliance dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/req-1/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /req-1/i }));
    expect(navigateMock).toHaveBeenCalledWith("/requisitions/req-1");
  });

  it("should submit requisitions and render inventory-related detail pages", async () => {
    await renderPage("../../client/src/pages/RequisitionNew");
    await userEvent.type(screen.getByLabelText(/file number/i), "REQ-1");
    await userEvent.type(screen.getByPlaceholderText(/laptop, printer ink/i), "Laptop");
    const fileInput = screen.getByLabelText(/attachment/i);
    const file = new File(["pdf"], "req.pdf", { type: "application/pdf" });
    await userEvent.upload(fileInput, file);
    await userEvent.click(screen.getByRole("button", { name: /submit requisition/i }));
    await waitFor(() => expect(requisitionCreateMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/requisitions/req-1");

    await renderPage("../../client/src/pages/TransferDetail");
    expect(screen.getByText(/transfer detail/i)).toBeInTheDocument();
    expect(screen.getByText(/handle carefully/i)).toBeInTheDocument();

    await renderPage("../../client/src/pages/InventoryHub");
    expect(screen.getAllByText(/inventory & assignments/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("data-table")).toBeInTheDocument();

    await renderPage("../../client/src/pages/Assignments");
    await userEvent.click(screen.getByRole("button", { name: /new assignment/i }));
    expect(screen.getByTestId("assignment-form-modal")).toBeInTheDocument();

    await renderPage("../../client/src/pages/MyAssets");
    await userEvent.click(screen.getByRole("button", { name: /mark consumed/i }));
    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), "2");
    await userEvent.click(screen.getByRole("button", { name: /confirm consumption/i }));
    await waitFor(() => expect(consumeConsumablesMutateAsyncMock).toHaveBeenCalled());
  });
});
