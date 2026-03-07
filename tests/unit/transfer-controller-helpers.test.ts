import { beforeEach, describe, expect, it, vi } from "vitest";

const officeFindByIdMock = vi.fn();
const storeFindOneMock = vi.fn();
const storeFindOneAndUpdateMock = vi.fn();
const documentExistsMock = vi.fn();
const assetItemFindMock = vi.fn();
const recordFindOneMock = vi.fn();
const updateRecordStatusMock = vi.fn();

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    findById: (...args: unknown[]) => officeFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/models/store.model", () => ({
  StoreModel: {
    findOne: (...args: unknown[]) => storeFindOneMock(...args),
    findOneAndUpdate: (...args: unknown[]) => storeFindOneAndUpdateMock(...args),
  },
}));

vi.mock("../../server/src/models/document.model", () => ({
  DocumentModel: {
    exists: (...args: unknown[]) => documentExistsMock(...args),
  },
}));

vi.mock("../../server/src/models/assetItem.model", () => ({
  AssetItemModel: {
    find: (...args: unknown[]) => assetItemFindMock(...args),
  },
}));

vi.mock("../../server/src/models/record.model", () => ({
  RecordModel: {
    findOne: (...args: unknown[]) => recordFindOneMock(...args),
  },
}));

vi.mock("../../server/src/modules/records/services/record.service", () => ({
  createRecord: vi.fn(),
  updateRecordStatus: (...args: unknown[]) => updateRecordStatusMock(...args),
}));

import {
  parseLinePayload,
  getTransferLineAssetIds,
  ensureTransferLines,
  normalizeTransferForResponse,
  ensureOfficeExists,
  resolveHeadOfficeStore,
  ensureDocumentExists,
  canApproveTransfer,
  canOperateSourceOffice,
  canOperateDestinationOffice,
  loadTransferAssetItems,
  updateTransferRecordStatus,
  assertTransition,
  HEAD_OFFICE_STORE_CODE,
} from "../../server/src/controllers/transfer.controller.helpers";

describe("transfer.controller.helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should validate and de-duplicate transfer line payloads", () => {
    expect(() => parseLinePayload([])).toThrow(/at least one transfer line is required/i);
    expect(() => parseLinePayload([null])).toThrow(/lines\[0\] is invalid/i);
    expect(() => parseLinePayload([{ notes: "x" }])).toThrow(/asset_item_id is required/i);

    expect(
      parseLinePayload([
        { assetItemId: "item-1", notes: "First" },
        { asset_item_id: "item-1", notes: "Duplicate" },
        { asset_item_id: "item-2" },
      ])
    ).toEqual([
      { asset_item_id: "item-1", notes: "First" },
      { asset_item_id: "item-2", notes: null },
    ]);
  });

  it("should normalize transfer lines and expose line asset ids", () => {
    const transfer = { lines: [{ asset_item_id: "item-1" }, { asset_item_id: "item-2" }] };
    expect(getTransferLineAssetIds(transfer)).toEqual(["item-1", "item-2"]);

    const raw: Record<string, unknown> = {};
    ensureTransferLines(raw);
    expect(raw.lines).toEqual([]);

    expect(
      normalizeTransferForResponse({
        toJSON: () => ({ id: "transfer-1" }),
      })
    ).toEqual({ id: "transfer-1", lines: [] });
  });

  it("should validate related office and document existence", async () => {
    officeFindByIdMock.mockResolvedValueOnce(null);
    await expect(ensureOfficeExists("office-1")).rejects.toMatchObject({ status: 404 });

    officeFindByIdMock.mockResolvedValueOnce({ id: "office-1" });
    await expect(ensureOfficeExists("office-1")).resolves.toEqual({ id: "office-1" });

    documentExistsMock.mockResolvedValueOnce(false);
    await expect(ensureDocumentExists("doc-1", "Approval order")).rejects.toMatchObject({ status: 404 });

    documentExistsMock.mockResolvedValueOnce(true);
    await expect(ensureDocumentExists("doc-1", "Approval order")).resolves.toBeUndefined();
  });

  it("should initialize or repair the head office store", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    storeFindOneMock.mockResolvedValueOnce(null);
    storeFindOneAndUpdateMock.mockResolvedValueOnce({ id: "store-1", code: HEAD_OFFICE_STORE_CODE, is_active: true, is_system: true });

    await expect(resolveHeadOfficeStore()).resolves.toMatchObject({ id: "store-1" });

    storeFindOneMock.mockResolvedValueOnce({
      id: "store-2",
      code: HEAD_OFFICE_STORE_CODE,
      is_active: false,
      is_system: false,
      name: "",
      save: saveMock,
    });

    const repaired = await resolveHeadOfficeStore();
    expect(repaired.is_active).toBe(true);
    expect(repaired.is_system).toBe(true);
    expect(repaired.name).toBe("Central Store");
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("should evaluate role-based transfer permissions", () => {
    const orgAdmin = { isOrgAdmin: true, role: "org_admin", officeId: null };
    const officeHead = { isOrgAdmin: false, role: "office_head", officeId: "office-1" };
    const caretaker = { isOrgAdmin: false, role: "caretaker", officeId: "office-1" };

    expect(canApproveTransfer(orgAdmin as never, "office-2")).toBe(true);
    expect(canApproveTransfer(officeHead as never, "office-1")).toBe(true);
    expect(canApproveTransfer(caretaker as never, "office-1")).toBe(false);
    expect(canOperateSourceOffice(caretaker as never, "office-1")).toBe(true);
    expect(canOperateDestinationOffice(caretaker as never, "office-1")).toBe(true);
    expect(canOperateDestinationOffice(caretaker as never, "office-2")).toBe(false);
  });

  it("should load transfer asset items and handle missing item conditions", async () => {
    await expect(loadTransferAssetItems({ lines: [] })).rejects.toMatchObject({ status: 400 });

    assetItemFindMock.mockResolvedValueOnce([{ id: "item-1" }]);
    await expect(loadTransferAssetItems({ lines: [{ asset_item_id: "item-1" }, { asset_item_id: "item-2" }] })).rejects.toMatchObject({ status: 404 });

    assetItemFindMock.mockResolvedValueOnce([{ id: "item-1" }, { id: "item-2" }]);
    await expect(
      loadTransferAssetItems({ lines: [{ asset_item_id: "item-1" }, { asset_item_id: "item-2" }] })
    ).resolves.toEqual({ items: [{ id: "item-1" }, { id: "item-2" }], assetItemIds: ["item-1", "item-2"] });
  });

  it("should update linked record status safely and validate status transitions", async () => {
    recordFindOneMock.mockReturnValueOnce({ session: () => Promise.resolve(null) });
    await expect(
      updateTransferRecordStatus({ userId: "user-1", role: "office_head", officeId: "office-1", isOrgAdmin: false } as never, "transfer-1", "Approved", undefined, {} as never)
    ).resolves.toBeUndefined();

    recordFindOneMock.mockReturnValueOnce(Promise.resolve({ id: "record-1" }));
    updateRecordStatusMock.mockRejectedValueOnce(new Error("strict record rule"));
    await expect(
      updateTransferRecordStatus({ userId: "user-1", role: "office_head", officeId: "office-1", isOrgAdmin: false } as never, "transfer-1", "Completed", "done")
    ).resolves.toBeUndefined();

    recordFindOneMock.mockReturnValueOnce(Promise.resolve({ id: "record-2" }));
    updateRecordStatusMock.mockResolvedValueOnce(undefined);
    await updateTransferRecordStatus(
      { userId: "user-1", role: "office_head", officeId: "office-1", isOrgAdmin: false } as never,
      "transfer-2",
      "Rejected",
      "bad"
    );
    expect(updateRecordStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", role: "office_head" }),
      "record-2",
      "Rejected",
      "bad",
      undefined
    );

    await expect(assertTransition({ status: "REQUESTED" }, "APPROVED")).resolves.toBeUndefined();
    await expect(assertTransition({ status: "REQUESTED" }, "RECEIVED_AT_DEST")).rejects.toMatchObject({ status: 400 });
  });
});
