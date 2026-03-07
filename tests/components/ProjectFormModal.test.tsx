/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectFormModal } from "../../client/src/components/forms/ProjectFormModal";

describe("ProjectFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render create defaults and submit a valid new project", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(<ProjectFormModal open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), "Water Lab Upgrade");
    await userEvent.clear(screen.getByLabelText(/code/i));
    await userEvent.type(screen.getByLabelText(/code/i), "PRJ-100");
    await userEvent.type(screen.getByLabelText(/description/i), "Install new instruments");
    await userEvent.clear(screen.getByLabelText(/start date/i));
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-10");
    await userEvent.clear(screen.getByLabelText(/end date/i));
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-11");

    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Water Lab Upgrade",
        code: "PRJ-100",
        description: "Install new instruments",
        startDate: "2026-03-10",
        endDate: "2026-03-11",
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should block submit when the end date is not later than the start date", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ProjectFormModal open onOpenChange={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/name/i), "Water Lab Upgrade");
    await userEvent.type(screen.getByLabelText(/code/i), "PRJ-100");
    await userEvent.clear(screen.getByLabelText(/start date/i));
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-10");
    await userEvent.clear(screen.getByLabelText(/end date/i));
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-09");

    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/end date must be later than start date/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should render edit mode values and allow cancellation", async () => {
    const onOpenChange = vi.fn();

    render(
      <ProjectFormModal
        open
        onOpenChange={onOpenChange}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        project={{
          id: "project-1",
          name: "Existing Project",
          code: "PRJ-001",
          description: "Current timeline",
          start_date: "2026-01-01T00:00:00.000Z",
          end_date: "2026-12-31T00:00:00.000Z",
          created_at: "",
          updated_at: "",
        } as never}
      />
    );

    expect(screen.getByText(/edit project/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing Project")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PRJ-001")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
