/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createDivisionMutateAsyncMock = vi.fn();
const updateDivisionMutateAsyncMock = vi.fn();
const deleteDivisionMutateMock = vi.fn();
const createDistrictMutateAsyncMock = vi.fn();
const updateDistrictMutateAsyncMock = vi.fn();
const deleteDistrictMutateMock = vi.fn();
const createOfficeSubLocationMutateAsyncMock = vi.fn();
const updateOfficeSubLocationMutateAsyncMock = vi.fn();
const deleteOfficeSubLocationMutateMock = vi.fn();

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

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
      <select aria-label="select-trigger" value={ctx.value || ""} onChange={(e) => ctx.onValueChange?.(e.target.value)}>
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
  const SelectItem = ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>;
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
  CommandItem: ({ children, onSelect, disabled }: { children: React.ReactNode; onSelect?: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/radio-group", () => ({
  RadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadioGroupItem: ({ id, value }: { id: string; value: string }) => <input type="radio" id={id} value={value} onChange={() => undefined} />,
}));

vi.mock("@/components/ui/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ render }: { render: (props: { field: { value?: any; onChange: (value: any) => void } }) => React.ReactNode }) =>
    <>{render({ field: { value: "", onChange: () => undefined } })}</>,
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (value: boolean) => void }) => (
    <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (date?: Date) => void }) => (
    <button type="button" onClick={() => onSelect?.(new Date("2026-03-07T00:00:00.000Z"))}>
      pick-date
    </button>
  ),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({ data, actions }: { data: Array<Record<string, unknown>>; actions?: (row: any) => React.ReactNode }) => (
    <div>
      {data.map((row) => (
        <div key={String(row.id || row.name || Math.random())}>
          <span>{String(row.name || row.officeName || row.divisionName || row.id)}</span>
          {actions ? actions(row) : null}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg"><text>{value}</text></svg>,
}));

vi.mock("@/hooks/useDivisions", () => ({
  useDivisions: () => ({ data: [{ id: "division-1", name: "North", is_active: true }], isLoading: false }),
  useCreateDivision: () => ({ mutateAsync: (...args: unknown[]) => createDivisionMutateAsyncMock(...args) }),
  useUpdateDivision: () => ({ mutateAsync: (...args: unknown[]) => updateDivisionMutateAsyncMock(...args) }),
  useDeleteDivision: () => ({ mutate: (...args: unknown[]) => deleteDivisionMutateMock(...args) }),
}));

vi.mock("@/hooks/useDistricts", () => ({
  useDistricts: () => ({ data: [{ id: "district-1", name: "North One", division_id: "division-1", is_active: true }], isLoading: false }),
  useCreateDistrict: () => ({ mutateAsync: (...args: unknown[]) => createDistrictMutateAsyncMock(...args) }),
  useUpdateDistrict: () => ({ mutateAsync: (...args: unknown[]) => updateDistrictMutateAsyncMock(...args) }),
  useDeleteDistrict: () => ({ mutate: (...args: unknown[]) => deleteDistrictMutateMock(...args) }),
}));

vi.mock("@/hooks/useOfficeSubLocations", () => ({
  useOfficeSubLocations: () => ({ data: [{ id: "section-1", name: "Room A", office_id: "office-1", is_active: true }], isLoading: false }),
  useCreateOfficeSubLocation: () => ({ mutateAsync: (...args: unknown[]) => createOfficeSubLocationMutateAsyncMock(...args) }),
  useUpdateOfficeSubLocation: () => ({ mutateAsync: (...args: unknown[]) => updateOfficeSubLocationMutateAsyncMock(...args) }),
  useDeleteOfficeSubLocation: () => ({ mutate: (...args: unknown[]) => deleteOfficeSubLocationMutateMock(...args) }),
}));

import { CategoryFormModal } from "../../client/src/components/forms/CategoryFormModal";
import { DivisionFormModal } from "../../client/src/components/forms/DivisionFormModal";
import { DistrictFormModal } from "../../client/src/components/forms/DistrictFormModal";
import { SchemeFormModal } from "../../client/src/components/forms/SchemeFormModal";
import { ReturnFormModal } from "../../client/src/components/forms/ReturnFormModal";
import { SearchableSelect } from "../../client/src/components/shared/SearchableSelect";
import { DateRangeFilter } from "../../client/src/components/reports/DateRangeFilter";
import { QRCodeModal } from "../../client/src/components/shared/QRCodeModal";
import { DivisionManagementModal } from "../../client/src/components/shared/DivisionManagementModal";
import { DistrictManagementModal } from "../../client/src/components/shared/DistrictManagementModal";
import { OfficeSectionManagementModal } from "../../client/src/components/shared/OfficeSectionManagementModal";
import { PageSearchProvider, usePageSearch } from "../../client/src/contexts/PageSearchContext";

function PageSearchProbe() {
  const search = usePageSearch();
  return (
    <div>
      <span>{search?.term ?? "missing"}</span>
      <button type="button" onClick={() => search?.setTerm("hello")}>set-term</button>
    </div>
  );
}

describe("client gap batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("should submit category, division, district, and scheme modal data", async () => {
    const categorySubmit = vi.fn().mockResolvedValue(undefined);
    const divisionSubmit = vi.fn().mockResolvedValue(undefined);
    const districtSubmit = vi.fn().mockResolvedValue(undefined);
    const schemeSubmit = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <CategoryFormModal open onOpenChange={() => undefined} onSubmit={categorySubmit} />
    );
    await userEvent.type(screen.getByLabelText(/name/i), "Electronics");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(categorySubmit).toHaveBeenCalled());

    rerender(<DivisionFormModal open onOpenChange={() => undefined} onSubmit={divisionSubmit} />);
    const divisionName = screen.getByLabelText(/name/i);
    await userEvent.clear(divisionName);
    await userEvent.type(divisionName, "Operations");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(divisionSubmit).toHaveBeenCalledWith({ name: "Operations" }));

    rerender(
      <DistrictFormModal
        open
        onOpenChange={() => undefined}
        divisions={[{ id: "division-1", name: "Operations", is_active: true } as any]}
        onSubmit={districtSubmit}
      />
    );
    const districtName = screen.getByLabelText(/name/i);
    await userEvent.clear(districtName);
    await userEvent.type(districtName, "North District");
    await userEvent.click(screen.getByRole("combobox", { name: /division/i }));
    await userEvent.click(screen.getByRole("button", { name: /operations/i }));
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect(districtSubmit).toHaveBeenCalledWith({ name: "North District", divisionId: "division-1" })
    );

    rerender(
      <SchemeFormModal
        open
        onOpenChange={() => undefined}
        projects={[{ id: "project-1", name: "Project A" } as any]}
        onSubmit={schemeSubmit}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText("select-trigger"), "project-1");
    const schemeName = screen.getByLabelText(/name/i);
    await userEvent.clear(schemeName);
    await userEvent.type(schemeName, "Scheme A");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect(schemeSubmit).toHaveBeenCalledWith({ name: "Scheme A", projectId: "project-1", description: "" })
    );
  });

  it("should submit return modal data and render selected assignment context", async () => {
    const submitMock = vi.fn().mockResolvedValue(undefined);

    render(
      <ReturnFormModal
        open
        onOpenChange={() => undefined}
        assignments={[{ id: "assignment-1", asset_item_id: "item-1", employee_id: "employee-1", assigned_date: "2026-03-01T00:00:00.000Z", is_active: true } as any]}
        assetItems={[{ id: "item-1", asset_id: "asset-1", tag: "TAG-1" } as any]}
        employees={[{ id: "employee-1", first_name: "Sam", last_name: "Tech" } as any]}
        assets={[{ id: "asset-1", name: "Laptop" } as any]}
        onSubmit={submitMock}
      />
    );

    const selects = screen.getAllByLabelText("select-trigger");
    await userEvent.selectOptions(selects[0], "assignment-1");
    expect(screen.getAllByText(/sam tech/i).length).toBeGreaterThan(0);
    await userEvent.selectOptions(selects[1], "Damaged");
    await userEvent.type(screen.getByLabelText(/notes/i), "screen cracked");
    await userEvent.click(screen.getByRole("button", { name: /record return/i }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          assignmentId: "assignment-1",
          condition: "Damaged",
          notes: "screen cracked",
        })
      )
    );
  });

  it("should support searchable select, date range filter, and QR modal actions", async () => {
    const onValueChange = vi.fn();
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    const onClear = vi.fn();
    const openMock = vi.fn();
    const createElementSpy = vi.spyOn(document, "createElement");
    const linkClickMock = vi.fn();
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toDataURL: () => "data:image/png;base64,abc",
    };
    createElementSpy.mockImplementation(((tagName: string) => {
      if (tagName === "canvas") return fakeCanvas as any;
      if (tagName === "a") return { click: linkClickMock } as any;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as any;
    }) as any);
    const windowOpenSpy = vi.spyOn(window, "open").mockReturnValue({
      document: { write: vi.fn(), close: vi.fn() },
    } as any);
    const imageSetter = vi.spyOn(globalThis.Image.prototype as any, "src", "set").mockImplementation(function () {
      (this as any).onload?.();
    });

    render(
      <div>
        <SearchableSelect
          value=""
          onValueChange={onValueChange}
          options={[
            { value: "one", label: "One" },
            { value: "two", label: "Two", disabled: true },
          ]}
        />
        <DateRangeFilter
          startDate={new Date("2026-03-01T00:00:00.000Z")}
          endDate={new Date("2026-03-31T00:00:00.000Z")}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
          onClear={onClear}
          rangeText="March"
        />
        <QRCodeModal open onOpenChange={openMock} tag="TAG-1" assetName="Laptop" serialNumber="SER-1" />
      </div>
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("button", { name: /one/i }));
    expect(onValueChange).toHaveBeenCalledWith("one");

    const dateButtons = screen.getAllByRole("button", { name: /pick-date/i });
    await userEvent.click(dateButtons[0]);
    await userEvent.click(dateButtons[1]);
    expect(onStartDateChange).toHaveBeenCalled();
    expect(onEndDateChange).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(linkClickMock).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /print/i }));
    expect(windowOpenSpy).toHaveBeenCalled();

    imageSetter.mockRestore();
    windowOpenSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it("should manage divisions, districts, office sections, and page search state", async () => {
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Routes>
          <Route
            path="*"
            element={
              <PageSearchProvider>
                <PageSearchProbe />
                <DivisionManagementModal open onOpenChange={() => undefined} />
                <DistrictManagementModal
                  open
                  onOpenChange={() => undefined}
                  divisions={[{ id: "division-1", name: "North", is_active: true } as any]}
                />
                <OfficeSectionManagementModal
                  open
                  onOpenChange={() => undefined}
                  offices={[{ id: "office-1", name: "Main Office" } as any]}
                />
              </PageSearchProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Manage Divisions")).toBeInTheDocument();
    expect(screen.getByText("Manage Districts")).toBeInTheDocument();
    expect(screen.getByText(/manage rooms \/ sections/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /set-term/i }));
    expect(screen.getByText("hello")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    expect(deleteDivisionMutateMock).toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[1]);
    expect(deleteDistrictMutateMock).toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[2]);
    expect(deleteOfficeSubLocationMutateMock).toHaveBeenCalled();
  });
});
