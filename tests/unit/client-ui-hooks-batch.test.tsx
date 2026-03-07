/** @vitest-environment jsdom */
import React from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/toast", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="toast-provider">{children}</div>,
  Toast: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="toast" data-open={open ? "true" : "false"}>
      {children}
    </div>
  ),
  ToastTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ToastDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ToastClose: () => <button type="button">close</button>,
  ToastViewport: () => <div data-testid="toast-viewport" />,
}));

describe("client UI hooks batch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("should persist consumable mode selections in localStorage", async () => {
    localStorage.setItem("consumables.mode", "general");
    const { useConsumableMode } = await import("../../client/src/hooks/useConsumableMode");

    const { result } = renderHook(() => useConsumableMode());
    expect(result.current.mode).toBe("general");
    expect(result.current.isChemicals).toBe(false);

    act(() => result.current.setMode("chemicals"));

    expect(result.current.mode).toBe("chemicals");
    expect(result.current.isChemicals).toBe(true);
    expect(localStorage.getItem("consumables.mode")).toBe("chemicals");
  });

  it("should expose toast helpers through the UI alias and render toaster content", async () => {
    const uiToastModule = await import("../../client/src/components/ui/use-toast");
    const hookToastModule = await import("../../client/src/hooks/use-toast");
    const { Toaster } = await import("../../client/src/components/ui/toaster");

    expect(uiToastModule.toast).toBe(hookToastModule.toast);
    expect(uiToastModule.useToast).toBe(hookToastModule.useToast);

    hookToastModule.toast({ title: "Saved", description: "Changes stored" });
    render(<Toaster />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Changes stored")).toBeInTheDocument();
    expect(screen.getByTestId("toast-viewport")).toBeInTheDocument();
  });

  it("should render skeleton styles and export service and form barrels", async () => {
    const { Skeleton } = await import("../../client/src/components/ui/skeleton");
    const formsBarrel = await import("../../client/src/components/forms");
    const servicesBarrel = await import("../../client/src/services");

    const { container } = render(<Skeleton className="h-4 w-8" data-testid="skeleton" />);
    expect(screen.getByTestId("skeleton").className).toContain("animate-pulse");
    expect(screen.getByTestId("skeleton").className).toContain("h-4");
    expect(container.firstChild).toBeTruthy();

    expect(formsBarrel.AssetFormModal).toBeDefined();
    expect(formsBarrel.PurchaseOrderFormModal).toBeDefined();
    expect(servicesBarrel.authService).toBeDefined();
    expect(servicesBarrel.requisitionService).toBeDefined();
    expect(servicesBarrel.returnRequestService).toBeDefined();
    expect(servicesBarrel.consumableInventoryService).toBeDefined();
  });
});
