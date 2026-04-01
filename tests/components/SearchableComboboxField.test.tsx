/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SearchableComboboxField } from "../../client/src/components/forms/SearchableComboboxField";

function renderField(overrides?: Partial<React.ComponentProps<typeof SearchableComboboxField>>) {
  return render(
    <SearchableComboboxField
      label="Asset"
      open
      onOpenChange={() => {}}
      value="Printer"
      options={[
        {
          value: "laptop",
          searchText: "laptop notebook dell",
          primaryText: "Laptop",
        },
        {
          value: "printer",
          searchText: "printer hp laserjet",
          primaryText: "Printer",
        },
      ]}
      placeholder="Search asset by name..."
      searchPlaceholder="Type asset name..."
      emptyText="No asset found."
      onValueChange={() => {}}
      {...overrides}
    />
  );
}

describe("SearchableComboboxField", () => {
  it("renders the selected value and available options", () => {
    renderField();

    expect(screen.getByRole("combobox")).toHaveTextContent("Printer");
    expect(screen.getByPlaceholderText("Type asset name...")).toBeInTheDocument();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getAllByText("Printer")).toHaveLength(2);
  });

  it("uses the trigger width css variable on the dropdown content", () => {
    renderField();

    const input = screen.getByPlaceholderText("Type asset name...");
    const content = input.parentElement?.parentElement?.parentElement;

    expect(content).toHaveClass("w-[var(--radix-popover-trigger-width)]");
  });
});
