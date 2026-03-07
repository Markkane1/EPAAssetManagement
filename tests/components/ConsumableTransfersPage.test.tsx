/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const useConsumableModeMock = vi.fn();
const useConsumableItemsMock = vi.fn();
const useOfficesMock = vi.fn();
const useConsumableLotsMock = vi.fn();
const useConsumableContainersMock = vi.fn();
const useConsumableBalancesMock = vi.fn();
const useConsumableUnitsMock = vi.fn();
const useTransferConsumablesMock = vi.fn();

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

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description, extra }: { title: string; description?: string; extra?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {extra}
    </div>
  ),
}));

vi.mock("@/components/consumables/ConsumableModeToggle", () => ({
  ConsumableModeToggle: () => <div>mode-toggle</div>,
}));

vi.mock("@/components/ui/select", () => {
  const ReactModule = require("react") as typeof React;
  const SelectContext = ReactModule.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
    items: Array<{ value: string; label: React.ReactNode }>;
  }>({ items: [] });
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }) => {
    const items = findSelectItems(children);
    return <SelectContext.Provider value={{ value, onValueChange, items }}><div>{children}</div></SelectContext.Provider>;
  };
  const SelectTrigger = () => {
    const ctx = ReactModule.useContext(SelectContext);
    return (
      <select
        aria-label="select-trigger"
        value={ctx.value || ""}
        onChange={(event) => ctx.onValueChange?.(event.target.value)}
      >
        <option value="">Select</option>
        {ctx.items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.value}
          </option>
        ))}
      </select>
    );
  };
  const SelectContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const SelectItem = ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  );
  (SelectItem as any).displayName = "SelectItem";
  const SelectValue = () => null;
  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => <input aria-label={placeholder || "command-input"} />,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useConsumableMode", () => ({ useConsumableMode: () => useConsumableModeMock() }));
vi.mock("@/hooks/useConsumableItems", () => ({ useConsumableItems: () => useConsumableItemsMock() }));
vi.mock("@/hooks/useOffices", () => ({ useOffices: (...args: unknown[]) => useOfficesMock(...args) }));
vi.mock("@/hooks/useConsumableLots", () => ({ useConsumableLots: () => useConsumableLotsMock() }));
vi.mock("@/hooks/useConsumableContainers", () => ({ useConsumableContainers: () => useConsumableContainersMock() }));
vi.mock("@/hooks/useConsumableUnits", () => ({ useConsumableUnits: () => useConsumableUnitsMock() }));
vi.mock("@/hooks/useConsumableInventory", () => ({
  useConsumableBalances: (...args: unknown[]) => useConsumableBalancesMock(...args),
  useTransferConsumables: () => useTransferConsumablesMock(),
}));
vi.mock("@/lib/consumableMode", () => ({
  filterItemsByMode: (items: unknown[]) => items,
  filterLocationsByMode: (items: unknown[]) => items,
}));
vi.mock("@/lib/unitUtils", () => ({
  getCompatibleUnits: () => ["pcs", "box"],
}));

import ConsumableTransfers from "../../client/src/pages/consumables/ConsumableTransfers";

describe("ConsumableTransfers page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ role: "office_head", locationId: "office-1" });
    useConsumableModeMock.mockReturnValue({ mode: "consumables", setMode: vi.fn() });
    useConsumableItemsMock.mockReturnValue({
      data: [
        {
          id: "item-1",
          name: "Gloves",
          base_uom: "pcs",
          requires_container_tracking: false,
          is_controlled: false,
        },
      ],
    });
    useOfficesMock.mockReturnValue({
      data: [
        { id: "office-1", name: "Main Office" },
        { id: "office-2", name: "District Office" },
      ],
    });
    useConsumableLotsMock.mockReturnValue({ data: [{ id: "lot-1", consumable_id: "item-1", batch_no: "LOT-1" }] });
    useConsumableContainersMock.mockReturnValue({ data: [] });
    useConsumableBalancesMock.mockReturnValue({ data: [{ qty_on_hand_base: 25 }] });
    useConsumableUnitsMock.mockReturnValue({ data: [{ code: "pcs", name: "Pieces" }, { code: "box", name: "Boxes" }] });
    useTransferConsumablesMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
  });

  it("should render the transfer form with office-to-store defaults", () => {
    render(<ConsumableTransfers />);

    expect(screen.getByText("Transfers")).toBeInTheDocument();
    expect(screen.getByText(/transfer stock between central store and offices/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText("select-trigger")[0]).toHaveValue("OFFICE:office-1");
    expect(screen.getAllByLabelText("select-trigger")[1]).toHaveValue("STORE:HEAD_OFFICE_STORE");
  });

  it("should block transfers when the destination holder matches the source holder", async () => {
    render(<ConsumableTransfers />);

    const selects = screen.getAllByLabelText("select-trigger");
    await userEvent.selectOptions(selects[1], "OFFICE:office-1");
    await userEvent.click(screen.getByRole("button", { name: /gloves/i }));
    const quantityInput = screen.getByLabelText(/quantity \*/i);
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, "5");
    await userEvent.click(screen.getByRole("button", { name: /^transfer$/i }));

    expect(await screen.findByText(/destination holder must be different from source holder/i)).toBeInTheDocument();
  });

  it("should submit a transfer with the selected item and quantity", async () => {
    const transferMutation = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) };
    useTransferConsumablesMock.mockReturnValue(transferMutation);

    render(<ConsumableTransfers />);

    await userEvent.click(screen.getByRole("button", { name: /gloves/i }));
    const quantityInput = screen.getByLabelText(/quantity \*/i);
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, "5");
    await userEvent.click(screen.getByRole("button", { name: /^transfer$/i }));

    await waitFor(() => {
      expect(transferMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          fromHolderType: "OFFICE",
          fromHolderId: "office-1",
          toHolderType: "STORE",
          toHolderId: "HEAD_OFFICE_STORE",
          itemId: "item-1",
          qty: 5,
          uom: "pcs",
        })
      );
    });
  });

  it("should show the negative stock override controls for caretakers", async () => {
    useAuthMock.mockReturnValue({ role: "caretaker", locationId: "office-1" });

    render(<ConsumableTransfers />);

    expect(screen.getByText(/allow negative stock \(admin override\)/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByLabelText(/override note \*/i)).toBeInTheDocument();
  });
});
