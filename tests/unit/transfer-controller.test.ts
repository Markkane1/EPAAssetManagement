import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAccessContextMock = vi.fn();
const ensureOfficeScopeMock = vi.fn();
const transferFindMock = vi.fn();
const transferFindByIdMock = vi.fn();
const transferCreateMock = vi.fn();
const enforceAccessPolicyMock = vi.fn();
const ensureDocumentExistsMock = vi.fn();
const resolveHeadOfficeStoreMock = vi.fn();
const ensureOfficeExistsMock = vi.fn();
const normalizeTransferForResponseMock = vi.fn((transfer: any) => ({ ...transfer, normalized: true }));
const parseLinePayloadMock = vi.fn();
const assetItemFindMock = vi.fn();
const createRecordMock = vi.fn();
const logAuditMock = vi.fn();
const endSessionMock = vi.fn();
const withTransactionMock = vi.fn(async (handler: (session: unknown) => Promise<void>) => {
  await handler({});
});

vi.mock("mongoose", async () => {
  const actual = await vi.importActual<any>("mongoose");
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn(async () => ({ withTransaction: withTransactionMock, endSession: endSessionMock })),
      Types: actual.Types,
    },
    startSession: vi.fn(async () => ({ withTransaction: withTransactionMock, endSession: endSessionMock })),
  };
});

vi.mock("../../server/src/utils/accessControl", () => ({
  resolveAccessContext: (...args: unknown[]) => resolveAccessContextMock(...args),
  ensureOfficeScope: (...args: unknown[]) => ensureOfficeScopeMock(...args),
}));

vi.mock("../../server/src/models/transfer.model", () => ({
  TransferModel: {
    find: (...args: unknown[]) => transferFindMock(...args),
    findById: (...args: unknown[]) => transferFindByIdMock(...args),
    create: (...args: unknown[]) => transferCreateMock(...args),
  },
}));

vi.mock("../../server/src/models/assetItem.model", () => ({
  AssetItemModel: {
    find: (...args: unknown[]) => assetItemFindMock(...args),
  },
}));

vi.mock("../../server/src/services/policyEngine.service", () => ({
  enforceAccessPolicy: (...args: unknown[]) => enforceAccessPolicyMock(...args),
}));

vi.mock("../../server/src/modules/records/services/record.service", () => ({
  createRecord: (...args: unknown[]) => createRecordMock(...args),
  updateRecordStatus: vi.fn(),
}));

vi.mock("../../server/src/modules/records/services/audit.service", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

vi.mock("../../server/src/controllers/transfer.controller.helpers", () => ({
  HEAD_OFFICE_STORE_CODE: "HEAD_OFFICE_STORE",
  STATUS_FLOW: {},
  readParam: (req: any, key: string) => req.params?.[key],
  clampInt: (value: unknown, fallback: number) => Number(value || fallback),
  readId: (body: Record<string, any>, keys: string[]) => {
    for (const key of keys) {
      if (body[key]) return String(body[key]);
    }
    return "";
  },
  parseLinePayload: (...args: unknown[]) => parseLinePayloadMock(...args),
  getTransferLineAssetIds: vi.fn(() => ["item-1"]),
  ensureTransferLines: vi.fn(),
  normalizeTransferForResponse: (...args: unknown[]) => normalizeTransferForResponseMock(...args),
  ensureOfficeExists: (...args: unknown[]) => ensureOfficeExistsMock(...args),
  resolveHeadOfficeStore: (...args: unknown[]) => resolveHeadOfficeStoreMock(...args),
  ensureDocumentExists: (...args: unknown[]) => ensureDocumentExistsMock(...args),
  loadTransferAssetItems: vi.fn(),
  updateTransferRecordStatus: vi.fn(),
  assertTransition: vi.fn(),
}));

vi.mock("../../server/src/services/notification.service", () => ({
  createBulkNotifications: vi.fn(),
  resolveNotificationRecipientsByOffice: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../server/src/services/approvalMatrix.service", () => ({
  enforceApprovalMatrix: vi.fn(),
  markApprovalWorkflowExecuted: vi.fn(),
}));

vi.mock("../../server/src/utils/assetHolder", () => ({
  isAssetItemHeldByOffice: vi.fn(() => true),
  officeAssetItemFilter: vi.fn(),
  setAssetItemOfficeHolderUpdate: vi.fn(),
  setAssetItemStoreHolderUpdate: vi.fn(),
}));

import { transferController } from "../../server/src/controllers/transfer.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("transferController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transferFindMock.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: async () => [{ id: "transfer-1", from_office_id: "office-1", to_office_id: "office-2" }],
        }),
      }),
    });
    resolveHeadOfficeStoreMock.mockResolvedValue({ id: "store-1" });
    ensureDocumentExistsMock.mockResolvedValue(undefined);
    ensureOfficeExistsMock.mockResolvedValue(undefined);
    assetItemFindMock.mockResolvedValue([{ id: "item-1", assignment_status: "Unassigned" }]);
    transferCreateMock.mockResolvedValue([{ id: "transfer-2", from_office_id: "office-1", to_office_id: "office-2" }]);
    createRecordMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
    enforceAccessPolicyMock.mockResolvedValue(undefined);
    parseLinePayloadMock.mockReturnValue([{ asset_item_id: "item-1" }]);
  });

  it("should scope transfer listing to the caller office", async () => {
    resolveAccessContextMock.mockResolvedValue({ isOrgAdmin: false, officeId: "office-1", role: "caretaker" });

    const res = createResponse();
    await transferController.list({ query: { page: "2", limit: "25" }, user: { userId: "user-1" } } as never, res as never, vi.fn());

    expect(transferFindMock).toHaveBeenCalledWith({
      is_active: { $ne: false },
      $or: [{ from_office_id: "office-1" }, { to_office_id: "office-1" }],
    });
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: "transfer-1", normalized: true }),
    ]);
  });

  it("should block transfer detail access outside the assigned office", async () => {
    resolveAccessContextMock.mockResolvedValue({ isOrgAdmin: false, officeId: "office-3", role: "caretaker" });
    transferFindByIdMock.mockResolvedValue({ from_office_id: "office-1", to_office_id: "office-2" });

    const next = vi.fn();
    await transferController.getById(
      { params: { id: "transfer-1" }, user: { userId: "user-1" } } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should reject transfer creation when required fields are missing", async () => {
    resolveAccessContextMock.mockResolvedValue({ isOrgAdmin: false, officeId: "office-1", role: "office_head", userId: "user-1" });

    const missingOfficesNext = vi.fn();
    await transferController.create(
      { body: {}, user: { userId: "user-1", roles: ["office_head"] } } as never,
      createResponse() as never,
      missingOfficesNext
    );
    expect(missingOfficesNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));

    const missingDocNext = vi.fn();
    await transferController.create(
      {
        body: { fromOfficeId: "office-1", toOfficeId: "office-2", lines: [{ asset_item_id: "item-1" }] },
        user: { userId: "user-1", roles: ["office_head"] },
      } as never,
      createResponse() as never,
      missingDocNext
    );
    expect(missingDocNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it("should reject Central Store transfers for non-admin users", async () => {
    resolveAccessContextMock.mockResolvedValue({ isOrgAdmin: false, officeId: "office-2", role: "office_head", userId: "user-1" });

    const next = vi.fn();
    await transferController.create(
      {
        body: {
          fromOfficeId: "HEAD_OFFICE_STORE",
          toOfficeId: "office-2",
          approvalOrderDocumentId: "doc-1",
          lines: [{ asset_item_id: "item-1" }],
        },
        user: { userId: "user-1", roles: ["office_head"] },
      } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should scope office transfer listing by requested office id", async () => {
    resolveAccessContextMock.mockResolvedValue({ isOrgAdmin: false, officeId: "office-1", role: "caretaker" });

    const res = createResponse();
    await transferController.getByOffice(
      { params: { officeId: "office-1" }, query: { page: "1", limit: "20" }, user: { userId: "user-1" } } as never,
      res as never,
      vi.fn()
    );

    expect(transferFindMock).toHaveBeenCalledWith({
      is_active: { $ne: false },
      $or: [{ from_office_id: "office-1" }, { to_office_id: "office-1" }],
    });
    expect(res.json).toHaveBeenCalled();
  });

  it("should retire transfers for authorized users", async () => {
    resolveAccessContextMock.mockResolvedValue({ isOrgAdmin: true, officeId: null, role: "org_admin", userId: "admin-1" });
    const saveMock = vi.fn().mockResolvedValue(undefined);
    transferFindByIdMock.mockResolvedValue({ id: "transfer-1", is_active: true, save: saveMock });

    const res = createResponse();
    res.send = vi.fn().mockReturnValue(res);
    await transferController.remove(
      { params: { id: "transfer-1" }, user: { userId: "admin-1", roles: ["org_admin"] } } as never,
      res as never,
      vi.fn()
    );

    expect(saveMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
