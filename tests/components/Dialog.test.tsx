/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent } from "../../client/src/components/ui/dialog";

describe("Dialog", () => {
  it("keeps the dialog open when the backdrop is clicked by default", () => {
    const onOpenChange = vi.fn();

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <div>Dialog body</div>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement?.parentElement;

    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop!);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("max-h-[calc(100dvh-1.5rem)]");
  });

  it("still closes on Escape", () => {
    const onOpenChange = vi.fn();

    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <div>Dialog body</div>
        </DialogContent>
      </Dialog>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
