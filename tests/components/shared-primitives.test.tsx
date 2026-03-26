/** @vitest-environment jsdom */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/components/ui/toggle-group", () => ({
  ToggleGroup: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (value: string) => void;
  }) => (
    <div>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ value?: string; onClick?: () => void }>,
              {
                onClick: () => onValueChange?.(String(child.props.value || "")),
              }
            )
          : child
      )}
    </div>
  ),
  ToggleGroupItem: ({
    children,
    value,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value?: string }) => (
    <button type="button" data-value={value} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import { NavLink } from "../../client/src/components/NavLink";
import { ConsumableModeToggle } from "../../client/src/components/consumables/ConsumableModeToggle";
import { PageHeader } from "../../client/src/components/shared/PageHeader";
import { StatusBadge } from "../../client/src/components/shared/StatusBadge";
import { ViewModeToggle } from "../../client/src/components/shared/ViewModeToggle";
import { ExportButton } from "../../client/src/components/shared/ExportButton";

describe("shared primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should apply the active class to NavLink when the route matches", () => {
    render(
      <MemoryRouter initialEntries={["/active"]} future={routerFuture}>
        <NavLink to="/active" className="base" activeClassName="active">Active Link</NavLink>
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Active Link" })).toHaveClass("base");
    expect(screen.getByRole("link", { name: "Active Link" })).toHaveClass("active");
  });

  it("should emit the chosen consumable mode when a new option is clicked", async () => {
    const onChange = vi.fn();
    render(<ConsumableModeToggle mode="chemicals" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /general/i }));

    expect(onChange).toHaveBeenCalledWith("general");
  });

  it("should render the page header title, description, extra content, and action", async () => {
    const onClick = vi.fn();
    render(
      <PageHeader
        title="Inventory"
        description="Current stock"
        extra={<span>Extra block</span>}
        action={{ label: "Create", onClick }}
      />
    );

    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Current stock")).toBeInTheDocument();
    expect(screen.getByText("Extra block")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should render known and unknown status styles safely", () => {
    const { rerender } = render(<StatusBadge status="APPROVED" className="extra" />);
    expect(screen.getByText("APPROVED")).toHaveClass("bg-info/10", "extra");

    rerender(<StatusBadge status="UNKNOWN_STATE" />);
    expect(screen.getByText("UNKNOWN_STATE")).toHaveClass("bg-muted");
  });

  it("should emit the chosen view mode and ignore empty selections", async () => {
    const onModeChange = vi.fn();
    render(<ViewModeToggle mode="grid" onModeChange={onModeChange} />);

    await userEvent.click(screen.getByRole("button", { name: /list view/i }));
    expect(onModeChange).toHaveBeenCalledWith("list");
  });

  it("should export csv and json while surfacing toast feedback", async () => {
    const onExportCSV = vi.fn();
    const onExportJSON = vi.fn();
    render(<ExportButton onExportCSV={onExportCSV} onExportJSON={onExportJSON} />);

    await userEvent.click(screen.getByRole("button", { name: /export as csv/i }));
    await userEvent.click(screen.getByRole("button", { name: /export as json/i }));

    expect(onExportCSV).toHaveBeenCalledTimes(1);
    expect(onExportJSON).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("CSV export completed");
    expect(toastSuccessMock).toHaveBeenCalledWith("JSON export completed");
  });

  it("should show an error toast when csv export throws", async () => {
    render(<ExportButton onExportCSV={() => { throw new Error("boom"); }} />);

    await userEvent.click(screen.getByRole("button", { name: /export as csv/i }));

    expect(toastErrorMock).toHaveBeenCalledWith("Failed to export CSV");
  });
});
