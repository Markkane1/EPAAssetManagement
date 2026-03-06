/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePageSearchMock = vi.fn();
const headerPropsSpy = vi.fn();
const sidebarPropsSpy = vi.fn();

vi.mock("@/contexts/PageSearchContext", () => ({
  usePageSearch: () => usePageSearchMock(),
}));

vi.mock("../../client/src/components/layout/Header", () => ({
  Header: (props: Record<string, unknown>) => {
    headerPropsSpy(props);
    return (
      <div>
        <div data-testid="header-title">{String(props.title || "")}</div>
        <div data-testid="header-search">{String(props.searchValue || "")}</div>
        <button onClick={() => (props.onSearchChange as (value: string) => void)("updated-search")}>
          update search
        </button>
        <button onClick={() => (props.onMenuClick as () => void)()}>open menu</button>
      </div>
    );
  },
}));

vi.mock("../../client/src/components/layout/Sidebar", () => ({
  Sidebar: (props: Record<string, unknown>) => {
    sidebarPropsSpy(props);
    return (
      <div data-testid={props.isMobileDrawer ? "mobile-sidebar" : "desktop-sidebar"}>
        <span>{props.isMobileDrawer ? "mobile" : "desktop"}</span>
        {props.onNavigate ? (
          <button onClick={() => (props.onNavigate as () => void)()}>close drawer</button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    <div data-testid="sheet" data-open={open ? "true" : "false"}>
      {children}
    </div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MainLayout } from "../../client/src/components/layout/MainLayout";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

describe("MainLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePageSearchMock.mockReturnValue(null);
  });

  it("should render the header and children and manage a fallback local search term", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <MainLayout title="Dashboard" description="Overview">
          <div>Page body</div>
        </MainLayout>
      </MemoryRouter>
    );

    expect(screen.getByTestId("header-title")).toHaveTextContent("Dashboard");
    expect(screen.getByText("Page body")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("header-search")).toHaveTextContent("");

    await user.click(screen.getByRole("button", { name: "update search" }));

    expect(screen.getByTestId("header-search")).toHaveTextContent("updated-search");
  });

  it("should use the page-search context when available instead of the fallback state", async () => {
    const setTermMock = vi.fn();
    const user = userEvent.setup();
    usePageSearchMock.mockReturnValue({
      term: "context-search",
      setTerm: setTermMock,
    });

    render(
      <MemoryRouter future={routerFuture}>
        <MainLayout title="Assets">content</MainLayout>
      </MemoryRouter>
    );

    expect(screen.getByTestId("header-search")).toHaveTextContent("context-search");

    await user.click(screen.getByRole("button", { name: "update search" }));

    expect(setTermMock).toHaveBeenCalledWith("updated-search");
  });

  it("should open the mobile drawer from the header and close it when the mobile sidebar navigates", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={routerFuture}>
        <MainLayout title="Settings">content</MainLayout>
      </MemoryRouter>
    );

    expect(screen.getByTestId("sheet")).toHaveAttribute("data-open", "false");

    await user.click(screen.getByRole("button", { name: "open menu" }));

    expect(screen.getByTestId("sheet")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("mobile-sidebar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "close drawer" }));

    expect(screen.getByTestId("sheet")).toHaveAttribute("data-open", "false");
  });
});
