/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/SearchableSelect", () => ({
  SearchableSelect: ({ id, value, onValueChange, options, disabled }: {
    id?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    options?: Array<{ value: string; label: string }>;
    disabled?: boolean;
  }) => (
    <select
      aria-label={id || "select"}
      value={value || ""}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="">Select</option>
      {(options || []).map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

import { VendorFormModal } from "../../client/src/components/forms/VendorFormModal";

describe("VendorFormModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require office selection for org admins before submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <VendorFormModal
        open
        onOpenChange={vi.fn()}
        isOrgAdmin
        locations={[{ id: "office-1", name: "Central Office" } as never]}
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByLabelText(/^name/i), "Supply House");
    await userEvent.type(screen.getByLabelText(/contact person/i), "Sarah Khan");
    await userEvent.type(screen.getByLabelText(/^email/i), "sarah@example.com");
    await userEvent.type(screen.getByLabelText(/^phone/i), "12345");
    await userEvent.type(screen.getByLabelText(/^address/i), "Science Road");

    const createButton = screen.getByRole("button", { name: /create/i });
    await userEvent.click(createButton);

    expect(await screen.findByText(/office is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should submit valid vendor data and close the dialog", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <VendorFormModal
        open
        onOpenChange={onOpenChange}
        isOrgAdmin
        locations={[{ id: "office-1", name: "Central Office" } as never]}
        onSubmit={onSubmit}
      />
    );

    await userEvent.selectOptions(screen.getByLabelText(/officeid/i), "office-1");
    await userEvent.type(screen.getByLabelText(/^name/i), "Supply House");
    await userEvent.type(screen.getByLabelText(/contact person/i), "Sarah Khan");
    await userEvent.type(screen.getByLabelText(/^email/i), "sarah@example.com");
    await userEvent.type(screen.getByLabelText(/^phone/i), "12345");
    await userEvent.type(screen.getByLabelText(/^address/i), "Science Road");

    await waitFor(() => expect(screen.getByRole("button", { name: /create/i })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Supply House",
        contactInfo: "Sarah Khan",
        email: "sarah@example.com",
        phone: "12345",
        address: "Science Road",
        officeId: "office-1",
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should render edit mode values and prevent invalid email submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <VendorFormModal
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        vendor={{
          id: "vendor-1",
          name: "Lab Supply Co.",
          contact_info: "Sarah Khan",
          email: "sarah@example.com",
          phone: "12345",
          address: "Science Road",
          office_id: "office-1",
          created_at: "",
          updated_at: "",
        } as never}
      />
    );

    expect(screen.getByText(/edit vendor/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lab Supply Co.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/^email/i));
    await userEvent.type(screen.getByLabelText(/^email/i), "invalid-email");
    await userEvent.click(screen.getByRole("button", { name: /update/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
