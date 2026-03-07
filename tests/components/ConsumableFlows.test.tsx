/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const useConsumableModeMock = vi.fn();
const useConsumableItemsMock = vi.fn();
const useOfficesMock = vi.fn();
const useEmployeesMock = vi.fn();
const useOfficeSubLocationsMock = vi.fn();
const useConsumableLotsMock = vi.fn();
const useConsumableContainersMock = vi.fn();
const useConsumableBalancesMock = vi.fn();
const useConsumableLedgerMock = vi.fn();
const useConsumableReasonCodesMock = vi.fn();
const useConsumableUnitsMock = vi.fn();
const useTransferConsumablesMock = vi.fn();
const useConsumeConsumablesMock = vi.fn();
const useAdjustConsumablesMock = vi.fn();
const useReturnConsumablesMock = vi.fn();

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

vi.mock("@/components/layout/MainLayout", () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/shared/PageHeader", () => ({ PageHeader: ({ title, description, extra }: { title: string; description?: string; extra?: React.ReactNode }) => <div><h1>{title}</h1><p>{description}</p>{extra}</div> }));
vi.mock("@/components/shared/DataTable", () => ({ DataTable: ({ data }: { data: Array<Record<string, unknown>> }) => <div>{data.map((row) => <div key={String(row.id || row.reference || Math.random())}>{String(row.itemName || row.reference || row.id)}</div>)}</div> }));
vi.mock("@/components/consumables/ConsumableModeToggle", () => ({ ConsumableModeToggle: () => <div>mode-toggle</div> }));
vi.mock("@/components/shared/SearchableSelect", () => ({
  SearchableSelect: ({ value, onValueChange, options }: { value?: string; onValueChange?: (value: string) => void; options?: Array<{ value: string; label: string }> }) => (
    <select aria-label="searchable-select" value={value || ""} onChange={(e) => onValueChange?.(e.target.value)}>
      <option value="">Select</option>
      {(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));
vi.mock("@/components/ui/select", () => {
  const ReactModule = require("react") as typeof React;
  const SelectContext = ReactModule.createContext<{ value?: string; onValueChange?: (value: string) => void; items: Array<{ value: string; label: React.ReactNode }> }>({ items: [] });
  const Select = ({ value, onValueChange, children }: { value?: string; onValueChange?: (value: string) => void; children: React.ReactNode }) => {
    const items = findSelectItems(children);
    return <SelectContext.Provider value={{ value, onValueChange, items }}><div>{children}</div></SelectContext.Provider>;
  };
  const SelectTrigger = ({ children }: { children: React.ReactNode }) => {
    const ctx = ReactModule.useContext(SelectContext);
    return <select aria-label="select-trigger" value={ctx.value || ""} onChange={(e) => ctx.onValueChange?.(e.target.value)}><option value="">Select</option>{ctx.items.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}</select>;
  };
  const SelectContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const SelectItem = ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>;
  (SelectItem as any).displayName = "SelectItem";
  const SelectValue = () => null;
  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});
vi.mock("@/components/ui/popover", () => ({ Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/command", () => ({ Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CommandInput: ({ placeholder }: { placeholder?: string }) => <input aria-label={placeholder || "command-input"} />, CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => <button type="button" onClick={onSelect}>{children}</button> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useConsumableMode", () => ({ useConsumableMode: () => useConsumableModeMock() }));
vi.mock("@/hooks/useConsumableItems", () => ({ useConsumableItems: () => useConsumableItemsMock() }));
vi.mock("@/hooks/useOffices", () => ({ useOffices: (...args: unknown[]) => useOfficesMock(...args) }));
vi.mock("@/hooks/useEmployees", () => ({ useEmployees: () => useEmployeesMock() }));
vi.mock("@/hooks/useOfficeSubLocations", () => ({ useOfficeSubLocations: () => useOfficeSubLocationsMock() }));
vi.mock("@/hooks/useConsumableLots", () => ({ useConsumableLots: () => useConsumableLotsMock() }));
vi.mock("@/hooks/useConsumableContainers", () => ({ useConsumableContainers: () => useConsumableContainersMock() }));
vi.mock("@/hooks/useConsumableReasonCodes", () => ({ useConsumableReasonCodes: () => useConsumableReasonCodesMock() }));
vi.mock("@/hooks/useConsumableUnits", () => ({ useConsumableUnits: () => useConsumableUnitsMock() }));
vi.mock("@/hooks/useConsumableInventory", () => ({
  useConsumableBalances: (...args: unknown[]) => useConsumableBalancesMock(...args),
  useConsumableLedger: (...args: unknown[]) => useConsumableLedgerMock(...args),
  useTransferConsumables: () => useTransferConsumablesMock(),
  useConsumeConsumables: () => useConsumeConsumablesMock(),
  useAdjustConsumables: () => useAdjustConsumablesMock(),
  useReturnConsumables: () => useReturnConsumablesMock(),
}));
vi.mock("@/lib/consumableMode", () => ({ filterItemsByMode: (items: unknown[]) => items, filterLocationsByMode: (items: unknown[]) => items }));
vi.mock("@/lib/unitUtils", () => ({
  getCompatibleUnits: () => ["pcs", "box"],
  convertQuantity: (qty: number) => qty,
}));

import ConsumableAdjustments from "../../client/src/pages/consumables/ConsumableAdjustments";
import ConsumableAssignments from "../../client/src/pages/consumables/ConsumableAssignments";
import ConsumableConsume from "../../client/src/pages/consumables/ConsumableConsume";
import ConsumableReturns from "../../client/src/pages/consumables/ConsumableReturns";

describe("consumable flow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "org_admin", locationId: "office-1", isOrgAdmin: true });
    useConsumableModeMock.mockReturnValue({ mode: "consumables", setMode: vi.fn() });
    useConsumableItemsMock.mockReturnValue({ data: [{ id: "item-1", name: "Gloves", base_uom: "pcs", requires_container_tracking: false, is_controlled: false }] });
    useOfficesMock.mockReturnValue({ data: [{ id: "office-1", name: "Main Lab" }] });
    useEmployeesMock.mockReturnValue({ data: [{ id: "employee-1", first_name: "Sam", last_name: "Tech", email: "sam@test.com", location_id: "office-1", is_active: true }] });
    useOfficeSubLocationsMock.mockReturnValue({ data: [{ id: "section-1", name: "Chem Section" }] });
    useConsumableLotsMock.mockReturnValue({ data: [{ id: "lot-1", consumable_id: "item-1", lot_number: "LOT-1" }] });
    useConsumableContainersMock.mockReturnValue({ data: [] });
    useConsumableBalancesMock.mockReturnValue({ data: [{ consumable_item_id: "item-1", qty_on_hand_base: 25 }] });
    useConsumableLedgerMock.mockReturnValue({ data: [{ id: "tx-1", tx_type: "TRANSFER", reference: "ISSUE-1", itemName: "Gloves" }] });
    useConsumableReasonCodesMock.mockReturnValue({ data: [{ id: "reason-1", code: "COUNT", label: "Cycle count" }] });
    useConsumableUnitsMock.mockReturnValue({ data: [{ code: "pcs", name: "Pieces" }, { code: "box", name: "Boxes" }] });
    useTransferConsumablesMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
    useConsumeConsumablesMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
    useAdjustConsumablesMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
    useReturnConsumablesMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
  });

  it("should post an inventory adjustment based on the computed variance", async () => {
    const adjustMutation = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) };
    useAdjustConsumablesMock.mockReturnValue(adjustMutation);

    render(<ConsumableAdjustments />);

    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[1], "item-1");
    await userEvent.type(screen.getByLabelText(/actual count/i), "10");
    await userEvent.selectOptions(selects[3], "pcs");
    await userEvent.selectOptions(selects[4], "reason-1");
    await userEvent.click(screen.getByRole("button", { name: /post adjustment/i }));

    await waitFor(() => {
      expect(adjustMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          holderType: "OFFICE",
          holderId: "office-1",
          itemId: "item-1",
          qty: 15,
          direction: "DECREASE",
          reasonCodeId: "reason-1",
        })
      );
    });
  });

  it("should assign office stock to an employee holder", async () => {
    render(<ConsumableAssignments />);

    expect(screen.getByText(/recent assignments/i)).toBeInTheDocument();
    expect(screen.getByText(/sam tech/i)).toBeInTheDocument();
    expect(screen.getByText(/gloves/i)).toBeInTheDocument();
  });

  it("should let employees consume from assigned sections", async () => {
    useAuthMock.mockReturnValue({ role: "employee", locationId: "office-1", isOrgAdmin: false });

    render(<ConsumableConsume />);

    expect(screen.getByText(/record consumable usage/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Office$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/selected: sam tech/i)).toBeInTheDocument();
  });

  it("should return office stock to the central store", async () => {
    const returnMutation = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) };
    useReturnConsumablesMock.mockReturnValue(returnMutation);

    render(<ConsumableReturns />);

    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[1], "item-1");
    await userEvent.type(screen.getByLabelText(/^quantity \*/i), "4");
    await userEvent.selectOptions(selects[3], "pcs");
    await userEvent.click(screen.getByRole("button", { name: /return to store/i }));

    await waitFor(() => {
      expect(returnMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          fromHolderType: "OFFICE",
          fromHolderId: "office-1",
          toHolderType: "STORE",
          toHolderId: "HEAD_OFFICE_STORE",
          itemId: "item-1",
          qty: 4,
          uom: "pcs",
        })
      );
    });
  });
});
