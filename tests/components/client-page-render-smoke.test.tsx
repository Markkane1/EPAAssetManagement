/** @vitest-environment jsdom */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const navigateMock = vi.fn();
const exportToCSVMock = vi.fn();
const generateReportPDFMock = vi.fn();
const refetchMock = vi.fn();

const assets = [
  {
    id: "asset-1",
    name: "Laptop",
    description: "Office laptop",
    category_id: "cat-1",
    vendor_id: "vendor-1",
    project_id: "project-1",
    scheme_id: "scheme-1",
    quantity: 2,
    unit_price: 100000,
    acquisition_date: "2026-01-01T00:00:00.000Z",
    asset_source: "procurement",
    is_active: true,
    dimensions: { length: 10, width: 20, height: 1, unit: "cm" },
  },
];

const assetItems = [
  {
    id: "item-1",
    asset_id: "asset-1",
    tag: "TAG-001",
    serial_number: "SER-001",
    item_status: "AVAILABLE",
    assignment_status: "UNASSIGNED",
    functional_status: "WORKING",
    item_source: "procurement",
    office_id: "office-1",
    holder_type: "OFFICE",
    holder_id: "office-1",
  },
];

const categories = [
  { id: "cat-1", name: "Electronics", description: "Devices", scope: "GENERAL", asset_type: "ASSET" },
  { id: "cat-2", name: "Chemicals", description: "Lab stock", scope: "LAB_ONLY", asset_type: "CONSUMABLE" },
];
const vendors = [{ id: "vendor-1", name: "Vendor One" }];
const projects = [{ id: "project-1", name: "Project One" }];
const schemes = [{ id: "scheme-1", name: "Scheme One" }];
const locations = [
  { id: "office-1", name: "Head Office", type: "HEAD_OFFICE", capabilities: { consumables: true, chemicals: true } },
  { id: "office-2", name: "District Lab", type: "DISTRICT_LAB", capabilities: { consumables: true, chemicals: true } },
];
const employees = [
  {
    id: "employee-1",
    user_id: "user-1",
    first_name: "Ava",
    last_name: "Admin",
    email: "ava@example.com",
    location_id: "office-1",
    directorate_id: "directorate-1",
    job_title: "Analyst",
    phone: "123",
    is_active: true,
  },
];
const assignments = [{ id: "assignment-1", asset_item_id: "item-1", employee_id: "employee-1", status: "ACTIVE" }];
const offices = locations;
const divisions = [{ id: "division-1", name: "North" }];
const districts = [{ id: "district-1", name: "District One" }];
const stores = [{ id: "store-1", name: "Main Store", code: "MAIN", is_active: true }];
const purchaseOrders = [{ id: "po-1", order_number: "PO-1", vendor_id: "vendor-1", order_date: "2026-01-02", status: "PENDING", total_amount: 5000, unit_price: 1000, tax_percentage: 5, tax_amount: 250, source_type: "procurement", source_name: "Procurement", notes: "note" }];
const sections = [{ id: "section-1", office_id: "office-1", name: "Room A", is_active: true }];
const approvalRequests = [{ id: "approval-1", transaction_type: "CONSUMABLE_TRANSFER", approvals: [{ decision: "Approved" }], required_approvals: 2, risk_tags: ["HIGH_VALUE"], amount: 4500, requested_at: "2026-01-01T00:00:00.000Z", maker_user_id: "user-1", office_id: "office-1" }];
const consumableItems = [{ id: "consumable-1", name: "Acid", category_id: "cat-2", base_uom: "L", is_chemical: true, requires_lot_tracking: true, requires_container_tracking: true, default_min_stock: 2, is_controlled: true }];
const consumableUnits = [{ id: "unit-1", code: "L", name: "Litre" }];
const consumableLots = [{ id: "lot-1", consumable_item_id: "consumable-1", lot_number: "LOT-1" }];
const consumableBalances = [{ id: "balance-1", consumable_item_id: "consumable-1", holder_type: "OFFICE", holder_id: "office-2", quantity_on_hand: 8, quantity_reserved: 1, lot_id: "lot-1", lot_count: 1 }];
const maintenance = [{ id: "maintenance-1", asset_item_id: "item-1", scheduled_date: "2026-01-05", cost: 1000, status: "OPEN" }];
const directorates = [{ id: "directorate-1", name: "Operations" }];

function createMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    isPending: false,
  };
}

function makeModal(testId: string) {
  return ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
    open ? <div data-testid={testId}>{children}</div> : null;
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: "record-1" }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryFn }: { queryFn?: () => unknown }) => ({ data: queryFn ? queryFn() : undefined, isLoading: false }),
  useMutation: () => createMutation(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: "org_admin", isOrgAdmin: true, locationId: "office-1", user: { id: "user-1", email: "ava@example.com" } }),
}));

vi.mock("@/contexts/PageSearchContext", () => ({
  usePageSearch: () => ({ term: "", setTerm: vi.fn() }),
}));

vi.mock("@/hooks/useViewMode", () => ({
  useViewMode: () => ({ mode: "list", setMode: vi.fn() }),
}));

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description, action, extra }: any) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <button type="button" onClick={action.onClick}>{action.label}</button> : null}
      {extra}
    </div>
  ),
}));

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({ data = [], columns = [], actions, onRowClick }: any) => (
    <div data-testid="data-table">
      {data.length === 0 ? <span>No rows</span> : null}
      {data.map((row: any) => (
        <div key={row.id || row.tag || row.name} data-testid="table-row">
          {columns.map((column: any) => (
            <div key={column.key}>{column.render ? column.render(row[column.key], row) : String(row[column.key] ?? "")}</div>
          ))}
          {actions ? <div>{actions(row)}</div> : null}
          {onRowClick ? <button type="button" onClick={() => onRowClick(row)}>open-row</button> : null}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/shared/StatusBadge", () => ({ StatusBadge: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock("@/components/shared/ViewModeToggle", () => ({ ViewModeToggle: ({ onModeChange }: any) => <button type="button" onClick={() => onModeChange("grid")}>toggle-view</button> }));
vi.mock("@/components/shared/SearchableSelect", () => ({ SearchableSelect: ({ options = [], value = "", onValueChange }: any) => <select aria-label="searchable-select" value={value} onChange={(e) => onValueChange?.(e.target.value)}>{options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));
vi.mock("@/components/reports/DateRangeFilter", () => ({ DateRangeFilter: ({ onClear }: any) => <button type="button" onClick={onClear}>clear-dates</button> }));
vi.mock("@/components/consumables/ConsumableModeToggle", () => ({ ConsumableModeToggle: ({ onChange }: any) => <button type="button" onClick={() => onChange("chemicals")}>toggle-mode</button> }));

vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, type = "button", ...props }: any) => <button type={type} onClick={onClick} {...props}>{children}</button> }));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: any) => <div>{children}</div>, CardContent: ({ children }: any) => <div>{children}</div>, CardHeader: ({ children }: any) => <div>{children}</div>, CardTitle: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui/avatar", () => ({ Avatar: ({ children }: any) => <div>{children}</div>, AvatarFallback: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui/tabs", () => ({ Tabs: ({ children }: any) => <div>{children}</div>, TabsList: ({ children }: any) => <div>{children}</div>, TabsTrigger: ({ children, value, onClick }: any) => <button type="button" data-value={value} onClick={onClick}>{children}</button> }));
vi.mock("@/components/ui/label", () => ({ Label: ({ children }: any) => <label>{children}</label> }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (props: any) => <textarea {...props} /> }));
vi.mock("@/components/ui/input", () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock("@/components/ui/select", () => ({ Select: ({ children }: any) => <div>{children}</div>, SelectTrigger: ({ children }: any) => <div>{children}</div>, SelectValue: () => null, SelectContent: ({ children }: any) => <div>{children}</div>, SelectItem: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null), DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <div>{children}</div>, DialogDescription: ({ children }: any) => <div>{children}</div>, DialogFooter: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui/dropdown-menu", () => ({ DropdownMenu: ({ children }: any) => <div>{children}</div>, DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>, DropdownMenuContent: ({ children }: any) => <div>{children}</div>, DropdownMenuItem: ({ children, onClick, className }: any) => <button type="button" className={className} onClick={onClick}>{children}</button>, DropdownMenuSeparator: () => <hr /> }));

vi.mock("@/components/forms/AssetFormModal", () => ({ AssetFormModal: makeModal("asset-form-modal") }));
vi.mock("@/components/forms/OfficeAssetFormModal", () => ({ OfficeAssetFormModal: makeModal("office-asset-form-modal") }));
vi.mock("@/components/forms/AssetItemFormModal", () => ({ AssetItemFormModal: makeModal("asset-item-form-modal") }));
vi.mock("@/components/forms/AssetItemEditModal", () => ({ AssetItemEditModal: makeModal("asset-item-edit-modal") }));
vi.mock("@/components/forms/OfficeAssetItemFormModal", () => ({ OfficeAssetItemFormModal: makeModal("office-asset-item-form-modal") }));
vi.mock("@/components/forms/OfficeAssetItemEditModal", () => ({ OfficeAssetItemEditModal: makeModal("office-asset-item-edit-modal") }));
vi.mock("@/components/shared/AssignmentHistoryModal", () => ({ AssignmentHistoryModal: makeModal("assignment-history-modal") }));
vi.mock("@/components/shared/QRCodeModal", () => ({ QRCodeModal: makeModal("qr-code-modal") }));
vi.mock("@/components/forms/AssignmentFormModal", () => ({ AssignmentFormModal: makeModal("assignment-form-modal") }));
vi.mock("@/components/forms/CategoryFormModal", () => ({ CategoryFormModal: makeModal("category-form-modal") }));
vi.mock("@/components/forms/EmployeeFormModal", () => ({ EmployeeFormModal: makeModal("employee-form-modal") }));
vi.mock("@/components/forms/EmployeeTransferModal", () => ({ EmployeeTransferModal: makeModal("employee-transfer-modal") }));
vi.mock("@/components/forms/OfficeFormModal", () => ({ OfficeFormModal: makeModal("office-form-modal") }));
vi.mock("@/components/shared/DivisionManagementModal", () => ({ DivisionManagementModal: makeModal("division-management-modal") }));
vi.mock("@/components/shared/DistrictManagementModal", () => ({ DistrictManagementModal: makeModal("district-management-modal") }));
vi.mock("@/components/forms/PurchaseOrderFormModal", () => ({ PurchaseOrderFormModal: makeModal("purchase-order-form-modal") }));
vi.mock("@/components/forms/ConsumableItemFormModal", () => ({ ConsumableItemFormModal: makeModal("consumable-item-form-modal") }));

vi.mock("@/hooks/useAssets", () => ({
  useAssets: () => ({ data: assets, isLoading: false }),
  usePagedAssets: () => ({
    data: { items: assets, total: assets.length, page: 1, limit: 60 },
    isLoading: false,
  }),
  useCreateAsset: () => createMutation(),
  useUpdateAsset: () => createMutation(),
  useDeleteAsset: () => createMutation(),
}));
vi.mock("@/hooks/useAssetItems", () => ({
  useAssetItems: () => ({ data: assetItems, isLoading: false }),
  usePagedAssetItems: () => ({
    data: { items: assetItems, total: assetItems.length, page: 1, limit: 100 },
    isLoading: false,
  }),
  useCreateAssetItem: () => createMutation(),
  useUpdateAssetItem: () => createMutation(),
}));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: ({ assetType }: any = {}) => ({ data: categories.filter((entry) => !assetType || entry.asset_type === assetType), isLoading: false }),
  usePagedCategories: () => ({
    data: { items: categories, total: categories.length, page: 1, limit: 60 },
    isLoading: false,
  }),
  useCategoryCounts: () => ({
    data: {
      assets: { "cat-1": 1 },
      consumables: { "cat-2": 1 },
    },
    isLoading: false,
  }),
  useCreateCategory: () => createMutation(),
  useUpdateCategory: () => createMutation(),
  useDeleteCategory: () => createMutation(),
}));
vi.mock("@/hooks/useVendors", () => ({
  useVendors: () => ({ data: vendors, isLoading: false }),
  usePagedVendors: () => ({
    data: { items: vendors, total: vendors.length, page: 1, limit: 60 },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({ data: projects, isLoading: false }),
  usePagedProjects: () => ({
    data: { items: projects, total: projects.length, page: 1, limit: 60 },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useSchemes", () => ({ useSchemes: () => ({ data: schemes, isLoading: false }) }));
vi.mock("@/hooks/useLocations", () => ({ useLocations: () => ({ data: locations, isLoading: false }) }));
vi.mock("@/hooks/useAssignments", () => ({
  useAssignments: () => ({ data: assignments, isLoading: false }),
  usePagedAssignments: () => ({
    data: { items: assignments, total: assignments.length, page: 1, limit: 100 },
    isLoading: false,
  }),
  useCreateAssignment: () => createMutation(),
}));
vi.mock("@/hooks/useEmployees", () => ({
  useEmployees: () => ({ data: employees, isLoading: false }),
  usePagedEmployees: () => ({
    data: { items: employees, total: employees.length, page: 1, limit: 100 },
    isLoading: false,
  }),
  useCreateEmployee: () => createMutation(),
  useUpdateEmployee: () => createMutation(),
  useTransferEmployee: () => createMutation(),
}));
vi.mock("@/hooks/useDirectorates", () => ({ useDirectorates: () => ({ data: directorates, isLoading: false }) }));
vi.mock("@/hooks/useOffices", () => ({
  useOffices: () => ({ data: offices, isLoading: false }),
  usePagedOffices: () => ({
    data: { items: offices, total: offices.length, page: 1, limit: 60 },
    isLoading: false,
  }),
  useCreateOffice: () => createMutation(),
  useUpdateOffice: () => createMutation(),
  useDeleteOffice: () => createMutation(),
}));
vi.mock("@/hooks/useDivisions", () => ({ useDivisions: () => ({ data: divisions, isLoading: false }) }));
vi.mock("@/hooks/useDistricts", () => ({ useDistricts: () => ({ data: districts, isLoading: false }) }));
vi.mock("@/hooks/useStores", () => ({ useStores: () => ({ data: stores, isLoading: false }) }));
vi.mock("@/hooks/usePurchaseOrders", () => ({ usePurchaseOrders: () => ({ data: purchaseOrders, isLoading: false }), useCreatePurchaseOrder: () => createMutation(), useUpdatePurchaseOrder: () => createMutation(), useDeletePurchaseOrder: () => createMutation() }));
vi.mock("@/hooks/useOfficeSubLocations", () => ({ useOfficeSubLocations: () => ({ data: sections, isLoading: false }), useCreateOfficeSubLocation: () => createMutation(), useUpdateOfficeSubLocation: () => createMutation(), useDeleteOfficeSubLocation: () => createMutation() }));
vi.mock("@/hooks/useApprovalMatrix", () => ({ usePendingApprovalMatrixRequests: () => ({ data: approvalRequests, isLoading: false, isError: false, refetch: refetchMock }), useDecideApprovalMatrixRequest: () => createMutation() }));
vi.mock("@/hooks/useConsumableItems", () => ({ useConsumableItems: () => ({ data: consumableItems, isLoading: false }), useCreateConsumableItem: () => createMutation(), useUpdateConsumableItem: () => createMutation(), useDeleteConsumableItem: () => createMutation() }));
vi.mock("@/hooks/useConsumableUnits", () => ({ useConsumableUnits: () => ({ data: consumableUnits, isLoading: false }) }));
vi.mock("@/hooks/useConsumableMode", () => ({ useConsumableMode: () => ({ mode: "chemicals", setMode: vi.fn() }) }));
vi.mock("@/hooks/useConsumableInventory", () => ({
  useConsumableBalances: () => ({ data: consumableBalances, isLoading: false }),
  useConsumableLedger: () => ({ data: [{ id: "ledger-1", action: "RECEIVE", tx_type: "RECEIVE", qty_base: 2, consumable_item_id: "consumable-1", tx_time: "2026-01-03T00:00:00.000Z" }], isLoading: false }),
  useConsumableRollup: () => ({
    data: [{ itemId: "consumable-1", totalQtyBase: 8, byLocation: [{ locationId: "office-2", qtyOnHandBase: 8 }] }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useConsumableLots", () => ({ useConsumableLots: () => ({ data: consumableLots, isLoading: false }) }));
vi.mock("@/hooks/useMaintenance", () => ({ useMaintenance: () => ({ data: maintenance, isLoading: false }) }));

vi.mock("@/services/consumableInventoryService", () => ({ consumableInventoryService: { getRollup: vi.fn(() => ({ totalOnHand: 8, totalReserved: 1 })) } }));
vi.mock("@/lib/exportUtils", () => ({ exportToCSV: exportToCSVMock, filterRowsBySearch: (rows: any[]) => rows, formatDateForExport: (value: string) => value, formatCurrencyForExport: (value: number) => `PKR ${value}` }));
vi.mock("@/lib/reporting", () => ({ filterByDateRange: (rows: any[]) => rows || [], generateReportPDF: generateReportPDFMock, getDateRangeText: () => "All Time" }));
vi.mock("@/lib/locationUtils", () => ({ isHeadOfficeLocationName: () => true, isHeadOfficeLocation: () => true }));
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

describe("client page smoke coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("should render major admin pages and open their form dialogs", async () => {
    await renderPage("../../client/src/pages/Assets");
    expect(screen.getAllByText("Assets").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /add asset/i }));
    expect(screen.getByTestId("asset-form-modal")).toBeInTheDocument();

    await renderPage("../../client/src/pages/AssetItems");
    await userEvent.click(screen.getByRole("button", { name: /add item/i }));
    expect(screen.getByTestId("asset-item-form-modal")).toBeInTheDocument();

    await renderPage("../../client/src/pages/Categories");
    await userEvent.click(screen.getByRole("button", { name: /add category/i }));
    expect(screen.getByTestId("category-form-modal")).toBeInTheDocument();

    await renderPage("../../client/src/pages/Employees");
    await userEvent.click(screen.getByRole("button", { name: /add employee/i }));
    expect(screen.getByTestId("employee-form-modal")).toBeInTheDocument();

    await renderPage("../../client/src/pages/Offices");
    await userEvent.click(screen.getByRole("button", { name: /add office/i }));
    expect(screen.getByTestId("office-form-modal")).toBeInTheDocument();

    await renderPage("../../client/src/pages/PurchaseOrders");
    await userEvent.click(screen.getByRole("button", { name: /new order/i }));
    expect(screen.getByTestId("purchase-order-form-modal")).toBeInTheDocument();
  });

  it("should render rooms, approvals, and reports flows", async () => {
    await renderPage("../../client/src/pages/RoomsSections");
    expect(screen.getAllByText(/rooms & sections/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /add section/i }));
    expect(screen.getByRole("button", { name: /^create$/i })).toBeInTheDocument();

    await renderPage("../../client/src/pages/ApprovalMatrix");
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(screen.getByPlaceholderText(/enter review notes/i)).toBeInTheDocument();

    await renderPage("../../client/src/pages/Reports");
    expect(screen.getAllByText(/reports/i).length).toBeGreaterThan(0);

    await renderPage("../../client/src/pages/reports/AssetSummaryReport");
    await userEvent.click(screen.getByRole("button", { name: /^csv$/i }));
    await userEvent.click(screen.getByRole("button", { name: /^pdf$/i }));
    expect(exportToCSVMock).toHaveBeenCalled();
    expect(generateReportPDFMock).toHaveBeenCalled();
  });

  it("should render consumable master and inventory pages", async () => {
    await renderPage("../../client/src/pages/consumables/ConsumableMaster");
    expect(screen.getAllByText(/item master/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /add consumable item/i }));
    expect(screen.getByTestId("consumable-item-form-modal")).toBeInTheDocument();

    await renderPage("../../client/src/pages/consumables/ConsumableInventory");
    expect(screen.getAllByText(/consumable inventory/i).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("data-table").length).toBeGreaterThan(0);
  });
});


