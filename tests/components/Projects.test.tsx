/** @vitest-environment jsdom */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useProjectsMock = vi.fn();
const useProjectMock = vi.fn();
const useCreateProjectMock = vi.fn();
const useUpdateProjectMock = vi.fn();
const useDeleteProjectMock = vi.fn();

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/shared/ViewModeToggle", () => ({
  ViewModeToggle: () => <div data-testid="view-mode-toggle" />,
}));

vi.mock("@/components/shared/DataTable", () => ({
  DataTable: ({
    data,
    actions,
  }: {
    data: Array<Record<string, unknown>>;
    actions?: (row: Record<string, unknown>) => React.ReactNode;
  }) => (
    <div>
      {data.map((row) => (
        <div key={String(row.id)}>
          <span>{String(row.name)}</span>
          {actions ? actions(row) : null}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/forms/ProjectFormModal", () => ({
  ProjectFormModal: () => <div data-testid="project-form-modal" />,
}));

vi.mock("@/contexts/PageSearchContext", () => ({
  usePageSearch: () => ({ term: "" }),
}));

vi.mock("@/hooks/useViewMode", () => ({
  useViewMode: () => ({ mode: "list", setMode: vi.fn() }),
}));

vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => useProjectsMock(),
  useProject: (id: string) => useProjectMock(id),
  useCreateProject: () => useCreateProjectMock(),
  useUpdateProject: () => useUpdateProjectMock(),
  useDeleteProject: () => useDeleteProjectMock(),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
}));

import Projects from "../../client/src/pages/Projects";

describe("Projects page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectsMock.mockReturnValue({
      data: [
        {
          id: "project-1",
          name: "Hydrology Upgrade",
          code: "PRJ-001",
          description: "Improve lab instrumentation",
          start_date: "2026-01-01T00:00:00.000Z",
          end_date: "2026-12-31T00:00:00.000Z",
          budget: 250000,
          is_active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });
    useProjectMock.mockImplementation((id: string) =>
      id
        ? {
            data: {
              id,
              name: "Hydrology Upgrade",
              code: "PRJ-001",
              description: "Improve lab instrumentation",
              start_date: "2026-01-01T00:00:00.000Z",
              end_date: "2026-12-31T00:00:00.000Z",
              budget: 250000,
              is_active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-02T00:00:00.000Z",
            },
            isLoading: false,
            isError: false,
          }
        : {
            data: undefined,
            isLoading: false,
            isError: false,
          }
    );
    useCreateProjectMock.mockReturnValue({ mutateAsync: vi.fn() });
    useUpdateProjectMock.mockReturnValue({ mutateAsync: vi.fn() });
    useDeleteProjectMock.mockReturnValue({ mutate: vi.fn() });
  });

  it("should open a real project details dialog when View Details is clicked", async () => {
    render(<Projects />);

    await userEvent.click(screen.getByRole("button", { name: /view details/i }));

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Review the project record, timeline, and operational status.")).toBeInTheDocument();
    expect(within(dialog).getByText("Hydrology Upgrade")).toBeInTheDocument();
    expect(within(dialog).getByText("Improve lab instrumentation")).toBeInTheDocument();
    expect(within(dialog).getByText("PKR 250,000")).toBeInTheDocument();
  });
});
