/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useIsMobileMock = vi.fn();
const usePageSearchMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => useIsMobileMock(),
}));

vi.mock("@/contexts/PageSearchContext", () => ({
  usePageSearch: () => usePageSearchMock(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import { DataTable } from "../../client/src/components/shared/DataTable";

type Row = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
};

const columns = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" },
];

const rows: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: `row-${index + 1}`,
  name: `Asset ${index + 1}`,
  status: index % 2 === 0 ? "Active" : "Archived",
  createdAt: `2026-03-${String((index % 9) + 1).padStart(2, "0")}`,
}));

async function selectOption(triggerText: string, optionText: string) {
  const trigger = screen.getByRole("combobox", { name: new RegExp(triggerText, "i") });
  fireEvent.pointerDown(trigger);
  await userEvent.click(screen.getByText(optionText));
}

describe("DataTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
    useIsMobileMock.mockReturnValue(false);
    usePageSearchMock.mockReturnValue(null);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("should filter, paginate, and isolate row actions from row click handlers on desktop", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onActionClick = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={onRowClick}
        actions={(row) => <button onClick={() => onActionClick(row.id)}>Inspect</button>}
        searchPlaceholder="Search assets"
      />
    );

    expect(screen.getByText("Showing 1 to 10 of 12 results")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByText("Asset 1"));
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: "row-1" }));

    await user.click(screen.getAllByRole("button", { name: "Inspect" })[0]);
    expect(onActionClick).toHaveBeenCalledWith("row-1");
    expect(onRowClick).toHaveBeenCalledTimes(1);

    await user.type(screen.getByPlaceholderText("Search assets"), "Asset 12");
    expect(screen.getByText("Showing 1 to 1 of 1 results")).toBeInTheDocument();
    expect(screen.getByText("Asset 12")).toBeInTheDocument();
    expect(screen.queryByText("Asset 1")).not.toBeInTheDocument();
  });

  it("should add filters, narrow results, and clear filters back to the full dataset", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={columns} data={rows} />);

    await user.click(screen.getByRole("button", { name: /add filter/i }));

    const filterInputs = screen.getAllByPlaceholderText("Filter value...");
    await user.type(filterInputs[0], "Asset 12");

    expect(screen.getByText("Showing 1 to 1 of 1 results")).toBeInTheDocument();
    expect(screen.getByText("Asset 12")).toBeInTheDocument();
    expect(screen.queryByText("Asset 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(screen.getByText("Showing 1 to 10 of 12 results")).toBeInTheDocument();
    expect(screen.getByText("Asset 1")).toBeInTheDocument();
  });

  it("should export filtered rows as CSV and show an error when there are no rows to export", async () => {
    const user = userEvent.setup();
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");
    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "click", { value: anchorClick, configurable: true });
      }
      return element as HTMLElement;
    });

    const { unmount } = render(<DataTable columns={columns} data={rows.slice(0, 2)} exportFileName="Asset Export" />);

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByText("Export CSV"));

    expect(toastSuccessMock).toHaveBeenCalledWith("Exported 2 rows as CSV");
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    unmount();
    vi.clearAllMocks();
    useIsMobileMock.mockReturnValue(false);
    usePageSearchMock.mockReturnValue(null);

    render(<DataTable columns={columns} data={[]} />);

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByText("Export CSV"));

    expect(toastErrorMock).toHaveBeenCalledWith("No rows available for export");
  });

  it("should render the mobile card layout and empty state when the dataset is empty", () => {
    useIsMobileMock.mockReturnValue(true);

    const { rerender } = render(<DataTable columns={columns} data={rows.slice(0, 1)} />);

    expect(screen.getByText("Asset 1")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();

    rerender(<DataTable columns={columns} data={[]} />);

    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("should update the internal page size and expose the 100 per page option", async () => {
    const user = userEvent.setup();

    render(<DataTable columns={columns} data={rows} />);

    const pageSizeSelect = screen.getByRole("combobox", { name: /rows per page/i });
    expect(within(pageSizeSelect).getByRole("option", { name: "100 per page" })).toBeInTheDocument();

    await user.selectOptions(pageSizeSelect, "20");

    expect(screen.getByText("Showing 1 to 12 of 12 results")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("should call the external page size change handler when pagination is server-controlled", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={rows.slice(0, 10)}
        pagination={false}
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageSizeChange={onPageSizeChange}
      />
    );

    const pageSizeSelect = screen.getByRole("combobox", { name: /rows per page/i });
    await user.selectOptions(pageSizeSelect, "100");

    expect(onPageSizeChange).toHaveBeenCalledWith(100);
  });
});
