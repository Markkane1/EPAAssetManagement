/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/forms/SearchableComboboxField", () => ({
  SearchableComboboxField: ({
    label,
    value,
    options,
    onValueChange,
    error,
    disabled,
  }: {
    label: string;
    value?: string;
    options: Array<{ value: string; primaryText: string }>;
    onValueChange: (value: string) => void;
    error?: string;
    disabled?: boolean;
  }) => {
    const selectedValue = options.find((option) => option.primaryText === value)?.value || "";

    return (
      <label>
        <span>{label}</span>
        <select
          aria-label={label}
          disabled={disabled}
          value={selectedValue}
          onChange={(event) => onValueChange(event.target.value)}
        >
          <option value="">Select</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.primaryText}
            </option>
          ))}
        </select>
        {error ? <span>{error}</span> : null}
      </label>
    );
  },
}));

import { AssetItemFormModal } from "../../client/src/components/forms/AssetItemFormModal";

describe("AssetItemFormModal", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      isOrgAdmin: true,
      locationId: null,
    });
  });

  it("uses a real office as the default org-admin destination instead of the synthetic head office store", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <AssetItemFormModal
        open
        onOpenChange={() => {}}
        assets={[
          {
            id: "asset-1",
            name: "Desktop Computer",
            description: "Office desktop",
            quantity: 2,
            category_id: "cat-1",
            created_at: "",
            updated_at: "",
          } as any,
        ]}
        locations={[
          {
            id: "office-head",
            name: "Head Office",
            type: "HEAD_OFFICE",
            is_active: true,
            created_at: "",
            updated_at: "",
          } as any,
          {
            id: "office-2",
            name: "District Office",
            type: "DISTRICT_OFFICE",
            is_active: true,
            created_at: "",
            updated_at: "",
          } as any,
        ]}
        onSubmit={onSubmit}
      />
    );

    expect(screen.queryByText("Central Store")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Asset *"), "asset-1");
    await userEvent.type(screen.getByPlaceholderText("e.g., SN123456789"), "SN-001");
    await userEvent.click(screen.getByRole("button", { name: "Create Item" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          assetId: "asset-1",
          locationId: "office-head",
          items: [{ serialNumber: "SN-001", warrantyExpiry: undefined }],
        })
      );
    });
  });
});
