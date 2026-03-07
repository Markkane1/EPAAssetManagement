/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  default: apiMock,
}));

describe("client services batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build requisition requests and upload payloads correctly", async () => {
    const { requisitionService } = await import("../../client/src/services/requisitionService");
    const file = new File(["req"], "req.pdf", { type: "application/pdf" });

    await requisitionService.list({ officeId: "office-1", status: "PENDING", page: 2, limit: 10, fileNumber: "REQ-1" });
    expect(apiMock.get).toHaveBeenCalledWith("/requisitions?officeId=office-1&status=PENDING&page=2&limit=10&fileNumber=REQ-1");

    await requisitionService.getById("req-1");
    expect(apiMock.get).toHaveBeenCalledWith("/requisitions/req-1");

    await requisitionService.create({
      file_number: "REQ-1",
      office_id: "office-1",
      target_type: "EMPLOYEE",
      target_id: "employee-1",
      linked_sub_location_id: "section-1",
      remarks: "note",
      lines: [{ line_type: "MOVEABLE", requested_name: "Laptop", requested_quantity: 1 }],
      requisition_file: file,
    });
    const uploadCall = apiMock.upload.mock.calls[0];
    expect(uploadCall[0]).toBe("/requisitions");
    expect(uploadCall[1]).toBeInstanceOf(FormData);
    expect(uploadCall[1].get("fileNumber")).toBe("REQ-1");
    expect(uploadCall[1].get("officeId")).toBe("office-1");
    expect(uploadCall[1].get("target_type")).toBe("EMPLOYEE");
    expect(uploadCall[1].get("target_id")).toBe("employee-1");
    expect(uploadCall[1].get("linked_sub_location_id")).toBe("section-1");
    expect(uploadCall[1].get("remarks")).toBe("note");
    expect(uploadCall[1].get("lines")).toBe('[{"line_type":"MOVEABLE","requested_name":"Laptop","requested_quantity":1}]');

    await requisitionService.mapLine("req-1", "line-1", { map_type: "MOVEABLE", asset_id: "asset-1" });
    expect(apiMock.post).toHaveBeenCalledWith("/requisitions/req-1/lines/line-1/map", { map_type: "MOVEABLE", asset_id: "asset-1" });

    await requisitionService.verify("req-1", { decision: "VERIFY", remarks: "ok" });
    expect(apiMock.post).toHaveBeenCalledWith("/requisitions/req-1/verify", { decision: "VERIFY", remarks: "ok" });

    await requisitionService.fulfill("req-1", { lines: [{ lineId: "line-1", issuedQuantity: 1 }] });
    expect(apiMock.post).toHaveBeenCalledWith("/requisitions/req-1/fulfill", { lines: [{ lineId: "line-1", issuedQuantity: 1 }] });

    await requisitionService.downloadIssuanceReportPdf("req-1");
    expect(apiMock.download).toHaveBeenCalledWith("/requisitions/req-1/issuance-report.pdf");

    const signedForm = new FormData();
    signedForm.append("file", file);
    await requisitionService.uploadSignedIssuance("req-1", signedForm);
    expect(apiMock.upload).toHaveBeenCalledWith("/requisitions/req-1/upload-signed-issuance", signedForm);

    await requisitionService.adjust("req-1", { adjustments: [{ lineId: "line-1" }], reason: "Fix quantity" });
    expect(apiMock.post).toHaveBeenCalledWith("/requisitions/req-1/adjust", { adjustments: [{ lineId: "line-1" }], reason: "Fix quantity" });
  });

  it("should build notification, user, report, and return request API calls", async () => {
    const { notificationService } = await import("../../client/src/services/notificationService");
    const { userService } = await import("../../client/src/services/userService");
    const { reportService } = await import("../../client/src/services/reportService");
    const { returnRequestService } = await import("../../client/src/services/returnRequestService");
    const file = new File(["signed"], "signed.pdf", { type: "application/pdf" });

    await notificationService.list({ unreadOnly: true, limit: 5, page: 3 });
    expect(apiMock.get).toHaveBeenCalledWith("/notifications?unreadOnly=true&limit=5&page=3");
    await notificationService.markRead("note-1");
    expect(apiMock.post).toHaveBeenCalledWith("/notifications/note-1/read");
    await notificationService.markAllRead();
    expect(apiMock.post).toHaveBeenCalledWith("/notifications/read-all");
    await notificationService.action("note-1", { action: "APPROVE", decisionNotes: "ok" });
    expect(apiMock.post).toHaveBeenCalledWith("/notifications/note-1/action", { action: "APPROVE", decisionNotes: "ok" });

    await userService.getAll({ page: 2, limit: 20, search: "  admin  " });
    expect(apiMock.get).toHaveBeenCalledWith("/users?page=2&limit=20&search=admin");
    await userService.getPaged({ page: 1, limit: 50, search: " ava " });
    expect(apiMock.get).toHaveBeenCalledWith("/users?meta=1&page=1&limit=50&search=ava");
    await userService.create({ email: "user@test.com", password: "Secret123!" });
    expect(apiMock.post).toHaveBeenCalledWith("/users", { email: "user@test.com", password: "Secret123!" });
    await userService.updateRole("user-1", { role: "employee", roles: ["employee"], activeRole: "employee" });
    expect(apiMock.put).toHaveBeenCalledWith("/users/user-1/role", { role: "employee", roles: ["employee"], activeRole: "employee" });
    await userService.updateLocation("user-1", "office-1");
    expect(apiMock.put).toHaveBeenCalledWith("/users/user-1/location", { locationId: "office-1" });
    await userService.resetPassword("user-1", "NewPass123!");
    expect(apiMock.put).toHaveBeenCalledWith("/users/user-1/password", { newPassword: "NewPass123!" });
    await userService.delete("user-1");
    expect(apiMock.delete).toHaveBeenCalledWith("/users/user-1");

    await reportService.getNonCompliance({ officeId: "office-1", from: "2026-01-01", to: "2026-01-31", page: 2, limit: 25 });
    expect(apiMock.get).toHaveBeenCalledWith("/reports/noncompliance?officeId=office-1&from=2026-01-01&to=2026-01-31&page=2&limit=25");

    await returnRequestService.list({ officeId: "office-1", status: "OPEN", employeeId: "employee-1", page: 1, limit: 10 });
    expect(apiMock.get).toHaveBeenCalledWith("/return-requests?officeId=office-1&status=OPEN&employeeId=employee-1&page=1&limit=10");
    await returnRequestService.getById("return-1");
    expect(apiMock.get).toHaveBeenCalledWith("/return-requests/return-1");
    await returnRequestService.create({ employeeId: "employee-1", officeId: "office-1", returnAll: true });
    expect(apiMock.post).toHaveBeenCalledWith("/return-requests", { employeeId: "employee-1", officeId: "office-1", returnAll: true });
    await returnRequestService.receive("return-1");
    expect(apiMock.post).toHaveBeenCalledWith("/return-requests/return-1/receive", {});
    await returnRequestService.downloadReturnReceiptPdf("return-1");
    expect(apiMock.download).toHaveBeenCalledWith("/return-requests/return-1/return-receipt.pdf");
    const signedReturn = new FormData();
    signedReturn.append("file", file);
    await returnRequestService.uploadSignedReturn("return-1", signedReturn);
    expect(apiMock.upload).toHaveBeenCalledWith("/return-requests/return-1/upload-signed-return", signedReturn);
  });

  it("should build consumable inventory requests and hook query configs", async () => {
    const { consumableInventoryService } = await import("../../client/src/services/consumableInventoryService");
    const transferServiceMock = {
      getAll: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      approve: vi.fn(),
      dispatchToStore: vi.fn(),
      receiveAtStore: vi.fn(),
      dispatchToDest: vi.fn(),
      receiveAtDest: vi.fn(),
      reject: vi.fn(),
      cancel: vi.fn(),
      delete: vi.fn(),
    };
    const notificationServiceMock = {
      list: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      action: vi.fn(),
    };
    const useQueryMock = vi.fn((config: any) => config);
    const invalidateQueriesMock = vi.fn();
    const toastSuccessMock = vi.fn();
    const toastErrorMock = vi.fn();

    vi.doMock("@/services/transferService", () => ({ transferService: transferServiceMock }));
    vi.doMock("@/services/notificationService", () => ({ notificationService: notificationServiceMock }));
    vi.doMock("@tanstack/react-query", () => ({
      useQuery: (config: any) => useQueryMock(config),
      useMutation: (config: any) => ({
        mutateAsync: async (input: unknown) => {
          const result = await config.mutationFn(input);
          await config.onSuccess?.(result);
          return result;
        },
        mutate: async (input: unknown, options?: any) => {
          try {
            const result = await config.mutationFn(input);
            await config.onSuccess?.(result);
            options?.onSuccess?.(result);
          } catch (error) {
            config.onError?.(error);
            options?.onError?.(error);
          }
        },
        isPending: false,
      }),
      useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
    }));
    vi.doMock("sonner", () => ({ toast: { success: (...args: unknown[]) => toastSuccessMock(...args), error: (...args: unknown[]) => toastErrorMock(...args) } }));

    const handoverFile = new File(["handover"], "handover.pdf", { type: "application/pdf" });
    await consumableInventoryService.receive({
      holderType: "OFFICE",
      holderId: "office-1",
      categoryId: "cat-1",
      itemId: "item-1",
      qty: 2,
      uom: "L",
      handoverDocumentationFile: handoverFile,
      lot: { lotNumber: "LOT-1", receivedDate: "2026-03-01", source: "procurement" },
    });
    const receiveForm = apiMock.upload.mock.calls[0][1] as FormData;
    expect(apiMock.upload.mock.calls[0][0]).toBe("/consumables/inventory/receive");
    expect(receiveForm.get("handoverDocumentation")).toBeTruthy();
    expect(String(receiveForm.get("payload"))).toContain('"holderId":"office-1"');

    await consumableInventoryService.receiveOffice({ categoryId: "cat-1", itemId: "item-1", qty: 5, uom: "EA" });
    expect(apiMock.upload.mock.calls[1][0]).toBe("/consumables/inventory/receive-office");

    await consumableInventoryService.transfer({ fromHolderId: "office-1", toHolderId: "office-2", itemId: "item-1", qty: 1, uom: "EA" });
    expect(apiMock.post).toHaveBeenCalledWith("/consumables/inventory/transfer", { fromHolderId: "office-1", toHolderId: "office-2", itemId: "item-1", qty: 1, uom: "EA" });
    await consumableInventoryService.consume({ holderId: "employee-1", itemId: "item-1", qty: 1, uom: "EA" });
    expect(apiMock.post).toHaveBeenCalledWith("/consumables/inventory/consume", { holderId: "employee-1", itemId: "item-1", qty: 1, uom: "EA" });
    await consumableInventoryService.adjust({ holderId: "office-1", itemId: "item-1", qty: 1, uom: "EA", direction: "INCREASE", reasonCodeId: "reason-1" });
    await consumableInventoryService.dispose({ holderId: "office-1", itemId: "item-1", qty: 1, uom: "EA", reasonCodeId: "reason-1" });
    await consumableInventoryService.returnToCentral({ fromHolderId: "office-1", toHolderId: "store-1", itemId: "item-1", qty: 1, uom: "EA" });
    await consumableInventoryService.openingBalance({ entries: [{ holderId: "office-1", itemId: "item-1", qty: 10, uom: "EA" }] });
    expect(apiMock.post).toHaveBeenCalled();

    await consumableInventoryService.getBalance({ holderType: "OFFICE", holderId: "office-1", itemId: "item-1", lotId: "lot-1" });
    expect(apiMock.get).toHaveBeenCalledWith("/consumables/inventory/balance?holderType=OFFICE&holderId=office-1&itemId=item-1&lotId=lot-1");
    await consumableInventoryService.getBalances({ holderType: "OFFICE", holderId: "office-1", itemId: "item-1", lotId: "lot-1" });
    expect(apiMock.get).toHaveBeenCalledWith("/consumables/inventory/balances?holderType=OFFICE&holderId=office-1&itemId=item-1&lotId=lot-1");
    await consumableInventoryService.getRollup("item-1");
    expect(apiMock.get).toHaveBeenCalledWith("/consumables/inventory/rollup?itemId=item-1");
    await consumableInventoryService.getLedger({ from: "2026-01-01", to: "2026-01-31", holderType: "OFFICE", holderId: "office-1", itemId: "item-1", lotId: "lot-1", txType: "RECEIVE" });
    expect(apiMock.get).toHaveBeenCalledWith("/consumables/ledger?from=2026-01-01&to=2026-01-31&holderType=OFFICE&holderId=office-1&itemId=item-1&lotId=lot-1&txType=RECEIVE");
    await consumableInventoryService.getExpiry(30, "OFFICE", "office-1");
    expect(apiMock.get).toHaveBeenCalledWith("/consumables/expiry?days=30&holderType=OFFICE&holderId=office-1");

    const { useTransfers, useTransfer, useCreateTransfer, useTransferAction, useDeleteTransfer } = await import("../../client/src/hooks/useTransfers");
    const { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useNotificationAction } = await import("../../client/src/hooks/useNotifications");

    expect(useTransfers().queryKey).toEqual(["transfers"]);
    expect(useTransfer("transfer-1").queryKey).toEqual(["transfers", "transfer-1"]);
    expect(useNotifications({ unreadOnly: true, limit: 5, page: 2, scopeKey: "user-1" }).queryKey).toEqual(["notifications", "user-1", true, 5, 2]);

    transferServiceMock.create.mockResolvedValueOnce({ id: "transfer-1" });
    transferServiceMock.dispatchToStore.mockResolvedValueOnce({ id: "transfer-1" });
    transferServiceMock.delete.mockResolvedValueOnce(undefined);
    notificationServiceMock.markRead.mockResolvedValueOnce({ id: "note-1" });
    notificationServiceMock.markAllRead.mockResolvedValueOnce({ modified: 1 });
    notificationServiceMock.action.mockResolvedValueOnce({ id: "note-1" });

    await useCreateTransfer().mutateAsync({ from_office_id: "office-1" } as any);
    await useTransferAction().mutateAsync({ id: "transfer-1", action: "dispatch_to_store", handoverDocumentId: "doc-1" });
    await useDeleteTransfer().mutateAsync("transfer-1");
    await useMarkNotificationRead().mutateAsync("note-1");
    await useMarkAllNotificationsRead().mutateAsync(undefined as any);
    await useNotificationAction().mutateAsync({ id: "note-1", action: "APPROVE" });

    expect(invalidateQueriesMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();

    await expect(useTransferAction().mutateAsync({ id: "transfer-1", action: "dispatch_to_store" })).rejects.toThrow("Handover document is required");
  });
});
