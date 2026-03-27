/** @vitest-environment jsdom */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const setQueryDataMock = vi.fn();
const removeQueriesMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const categoryServiceMock = {
  getAll: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const assetServiceMock = {
  getAll: vi.fn(),
  getById: vi.fn(),
  getByCategory: vi.fn(),
  getByVendor: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const assignmentServiceMock = {
  getAll: vi.fn(),
  getById: vi.fn(),
  getByEmployee: vi.fn(),
  getByAssetItem: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  requestReturn: vi.fn(),
  reassign: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => useQueryMock(config),
  useMutation: (config: unknown) => useMutationMock(config),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
    removeQueries: removeQueriesMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/services/categoryService", () => ({ categoryService: categoryServiceMock }));
vi.mock("@/services/assetService", () => ({ assetService: assetServiceMock }));
vi.mock("@/services/assignmentService", () => ({ assignmentService: assignmentServiceMock }));

describe("client hooks and entry batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((config: any) => config);
    useMutationMock.mockImplementation((config: any) => ({
      mutateAsync: async (input: unknown) => {
        const result = await config.mutationFn(input);
        await config.onSuccess?.(result, input);
        return result;
      },
      mutate: async (input: unknown) => {
        try {
          const result = await config.mutationFn(input);
          await config.onSuccess?.(result, input);
        } catch (error) {
          config.onError?.(error);
        }
      },
    }));
  });

  it("should configure category hooks and run create/update/delete success and error handlers", async () => {
    const hooks = await import("../../client/src/hooks/useCategories");
    const { useCategories, useCategory, useCreateCategory, useUpdateCategory, useDeleteCategory } = hooks;

    const categoriesQuery = useCategories({ scope: "GENERAL", assetType: "ASSET", search: "lap" } as any);
    expect(categoriesQuery.queryKey).toEqual(["categories", "list", "GENERAL", "ASSET", "lap"]);
    const categoryQuery = useCategory("category-1");
    expect(categoryQuery.enabled).toBe(true);

    categoryServiceMock.create.mockResolvedValueOnce({ id: "category-1" });
    categoryServiceMock.update.mockResolvedValueOnce({ id: "category-1" });
    categoryServiceMock.delete.mockResolvedValueOnce(undefined);

    await useCreateCategory().mutateAsync({ name: "Electronics" });
    await useUpdateCategory().mutateAsync({ id: "category-1", data: { name: "Updated" } });
    await useDeleteCategory().mutateAsync("category-1");

    expect(invalidateQueriesMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();

    categoryServiceMock.delete.mockRejectedValueOnce(new Error("boom"));
    await useDeleteCategory().mutate("category-1");
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("should configure asset hooks and assignment hooks with their query keys", async () => {
    const assetHooks = await import("../../client/src/hooks/useAssets");
    const assignmentHooks = await import("../../client/src/hooks/useAssignments");

    expect(assetHooks.useAssets().queryKey).toEqual(["assets", "list", ""]);
    expect(assetHooks.useAsset("asset-1").queryKey).toEqual(["assets", "detail", "asset-1"]);
    expect(assetHooks.useAssetsByCategory("category-1").queryKey).toEqual(["assets", "byCategory", "category-1"]);
    expect(assetHooks.useAssetsByVendor("vendor-1").queryKey).toEqual(["assets", "byVendor", "vendor-1"]);

    expect(assignmentHooks.useAssignments().queryKey).toEqual(["assignments"]);
    expect(assignmentHooks.useAssignment("assignment-1").queryKey).toEqual(["assignments", "assignment-1"]);
    expect(assignmentHooks.useAssignmentsByEmployee("employee-1").queryKey).toEqual(["assignments", "byEmployee", "employee-1"]);
    expect(assignmentHooks.useAssignmentsByAssetItem("asset-item-1").queryKey).toEqual(["assignments", "byAssetItem", "asset-item-1"]);
  });

  it("should execute assignment mutation hooks and toast on success and error", async () => {
    const {
      useCreateAssignment,
      useUpdateAssignment,
      useRequestReturn,
      useReassignAsset,
      useDeleteAssignment,
    } = await import("../../client/src/hooks/useAssignments");

    assignmentServiceMock.create.mockResolvedValueOnce({ id: "assignment-1" });
    assignmentServiceMock.update.mockResolvedValueOnce({ id: "assignment-1" });
    assignmentServiceMock.requestReturn.mockResolvedValueOnce({ id: "assignment-1" });
    assignmentServiceMock.reassign.mockResolvedValueOnce({ id: "assignment-2" });
    assignmentServiceMock.delete.mockRejectedValueOnce(new Error("bad"));

    await useCreateAssignment().mutateAsync({ assetItemId: "item-1" });
    await useUpdateAssignment().mutateAsync({ id: "assignment-1", data: { notes: "ok" } });
    await useRequestReturn().mutateAsync({ id: "assignment-1" });
    await useReassignAsset().mutateAsync({ id: "assignment-1", newEmployeeId: "employee-2" });
    await useDeleteAssignment().mutate("assignment-1");

    expect(invalidateQueriesMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("should cover useIsMobile, useToast, forms barrel, and main entry bootstrap", async () => {
    const listeners: Array<(ev: Event) => void> = [];
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: (_: string, cb: (ev: Event) => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    })));

    const { useIsMobile } = await import("../../client/src/hooks/use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    act(() => listeners[0]?.(new Event("change")));
    expect(result.current).toBe(false);

    const toastModule = await import("../../client/src/hooks/use-toast");
    const toastHandle = toastModule.toast({ title: "Saved" });
    expect(toastHandle.id).toBeDefined();
    const toastHook = renderHook(() => toastModule.useToast());
    act(() => toastHook.result.current.dismiss(toastHandle.id));
    expect(toastHook.result.current.toasts[0]?.open).toBe(false);

    const formsBarrel = await import("../../client/src/components/forms");
    expect(formsBarrel.CategoryFormModal).toBeDefined();
    expect(formsBarrel.AssetFormModal).toBeDefined();

    const renderMock = vi.fn();
    vi.doMock("react-dom/client", () => ({ createRoot: () => ({ render: renderMock }) }));
    vi.doMock("../../client/src/App.tsx", () => ({ default: () => React.createElement("div", null, "app") }));
    document.body.innerHTML = '<div id="root"></div>';
    await import("../../client/src/main");
    expect(renderMock).toHaveBeenCalled();
  });
});
