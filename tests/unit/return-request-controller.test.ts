import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestContextMock = vi.fn();
const isOfficeManagerMock = vi.fn((role: string) => role === "office_head" || role === "caretaker");
const logAuditMock = vi.fn();
const createBulkNotificationsMock = vi.fn();
const resolveNotificationRecipientsByOfficeMock = vi.fn();

const returnRequestFindMock = vi.fn();
const returnRequestCountDocumentsMock = vi.fn();
const returnRequestFindByIdMock = vi.fn();
const returnRequestCreateMock = vi.fn();

const employeeFindOneMock = vi.fn();
const employeeFindByIdMock = vi.fn();
const officeExistsMock = vi.fn();
const assignmentFindMock = vi.fn();
const assetItemFindMock = vi.fn();

vi.mock("../../server/src/utils/scope", () => ({
  getRequestContext: (...args: unknown[]) => getRequestContextMock(...args),
}));

vi.mock("../../server/src/utils/accessControl", () => ({
  isOfficeManager: (...args: unknown[]) => isOfficeManagerMock(...args),
}));

vi.mock("../../server/src/models/returnRequest.model", () => ({
  ReturnRequestModel: {
    find: (...args: unknown[]) => returnRequestFindMock(...args),
    countDocuments: (...args: unknown[]) => returnRequestCountDocumentsMock(...args),
    findById: (...args: unknown[]) => returnRequestFindByIdMock(...args),
    create: (...args: unknown[]) => returnRequestCreateMock(...args),
  },
}));

vi.mock("../../server/src/models/employee.model", () => ({
  EmployeeModel: {
    findOne: (...args: unknown[]) => employeeFindOneMock(...args),
    findById: (...args: unknown[]) => employeeFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    exists: (...args: unknown[]) => officeExistsMock(...args),
    findById: vi.fn(),
  },
}));

vi.mock("../../server/src/models/assignment.model", () => ({
  AssignmentModel: {
    find: (...args: unknown[]) => assignmentFindMock(...args),
  },
}));

vi.mock("../../server/src/models/assetItem.model", () => ({
  AssetItemModel: {
    find: (...args: unknown[]) => assetItemFindMock(...args),
    distinct: vi.fn(),
  },
}));

vi.mock("../../server/src/models/asset.model", () => ({ AssetModel: { find: vi.fn() } }));
vi.mock("../../server/src/models/record.model", () => ({ RecordModel: { findById: vi.fn() } }));
vi.mock("../../server/src/models/document.model", () => ({ DocumentModel: { findById: vi.fn(), find: vi.fn() } }));
vi.mock("../../server/src/models/documentVersion.model", () => ({ DocumentVersionModel: { findOne: vi.fn() } }));
vi.mock("../../server/src/models/documentLink.model", () => ({ DocumentLinkModel: { find: vi.fn(), findOne: vi.fn(), create: vi.fn() } }));

vi.mock("../../server/src/modules/records/services/audit.service", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

vi.mock("../../server/src/modules/records/services/record.service", () => ({
  createRecord: vi.fn(),
}));

vi.mock("../../server/src/services/returnRequestReceipt.service", () => ({
  generateAndStoreReturnReceipt: vi.fn(),
}));

vi.mock("../../server/src/utils/assetHolder", () => ({
  officeAssetItemFilter: vi.fn(() => ({ holder_office_id: "507f1f77bcf86cd799439021" })),
}));

vi.mock("../../server/src/utils/uploadValidation", () => ({
  assertUploadedFileIntegrity: vi.fn(),
}));

vi.mock("../../server/src/utils/requestParsing", () => ({
  escapeRegex: (value: string) => value,
}));

vi.mock("../../server/src/services/notification.service", () => ({
  createBulkNotifications: (...args: unknown[]) => createBulkNotificationsMock(...args),
  resolveNotificationRecipientsByOffice: (...args: unknown[]) => resolveNotificationRecipientsByOfficeMock(...args),
}));

vi.mock("../../server/src/controllers/returnRequest.controller.helpers", () => ({
  RECEIVE_ALLOWED_STATUSES: new Set(["SUBMITTED", "RECEIVED_CONFIRMED"]),
  SIGNED_UPLOAD_ALLOWED_STATUSES: new Set(["CLOSED_PENDING_SIGNATURE"]),
  asNullableString: (value: unknown) => {
    const next = String(value ?? "").trim();
    return next ? next : null;
  },
  parseBoolean: (value: unknown) => value === true || value === "true",
  parseDateInput: () => null,
  parsePositiveInt: (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  },
  readParam: (req: any, key: string) => req.params?.[key],
  parseAssetItemIds: (value: unknown) => (Array.isArray(value) ? value.map((entry) => String(entry)) : []),
  uniqueIds: (ids: Array<string | null | undefined>) => Array.from(new Set(ids.filter(Boolean))),
  displayEmployeeName: () => "Test Employee",
  getSignedReturnFile: () => null,
}));

import { returnRequestController } from "../../server/src/controllers/returnRequest.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.sendFile = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

function listQueryResult<T>(value: T) {
  return {
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: async () => value,
        }),
      }),
    }),
  };
}

function leanResult<T>(value: T) {
  return {
    lean: async () => value,
  };
}

describe("returnRequestController", () => {
  const officeId = "507f1f77bcf86cd799439021";
  const employeeId = "507f1f77bcf86cd799439022";
  const assetItemId = "507f1f77bcf86cd799439023";

  beforeEach(() => {
    vi.clearAllMocks();
    resolveNotificationRecipientsByOfficeMock.mockResolvedValue(["507f1f77bcf86cd799439099"]);
    employeeFindOneMock.mockReturnValue(leanResult({ _id: employeeId, location_id: officeId }));
    employeeFindByIdMock.mockReturnValue(leanResult({ _id: employeeId, location_id: officeId }));
    officeExistsMock.mockResolvedValue(true);
    assignmentFindMock.mockReturnValue(leanResult([{ asset_item_id: assetItemId }]));
    assetItemFindMock.mockReturnValue(leanResult([{ _id: assetItemId }]));
    returnRequestCountDocumentsMock.mockResolvedValue(1);
    returnRequestCreateMock.mockResolvedValue({
      id: "507f1f77bcf86cd799439050",
      status: "SUBMITTED",
    });
    logAuditMock.mockResolvedValue(undefined);
    createBulkNotificationsMock.mockResolvedValue(undefined);
  });

  it("should list only the current employee return requests when the caller role is employee", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "employee",
      isOrgAdmin: false,
      locationId: officeId,
    });
    returnRequestFindMock.mockReturnValue(
      listQueryResult([
        { _id: "return-1", employee_id: employeeId, office_id: officeId, status: "SUBMITTED" },
      ])
    );

    const res = createResponse();
    await returnRequestController.list(
      { query: { page: "2", limit: "25" }, user: { userId: "user-1", email: "user@test.com" } } as never,
      res as never,
      vi.fn()
    );

    expect(returnRequestFindMock).toHaveBeenCalledWith({
      employee_id: employeeId,
      office_id: officeId,
    });
    expect(res.json).toHaveBeenCalledWith({
      data: [{ _id: "return-1", employee_id: employeeId, office_id: officeId, status: "SUBMITTED" }],
      page: 2,
      limit: 25,
      total: 1,
    });
  });

  it("should return 404 when the requested return request does not exist", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "org_admin",
      isOrgAdmin: true,
      locationId: null,
    });
    returnRequestFindByIdMock.mockReturnValue(leanResult(null));

    const next = vi.fn();
    await returnRequestController.getById(
      { params: { id: "return-1" }, user: { userId: "admin-1" } } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("should reject employee access to another employee return request", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "employee",
      isOrgAdmin: false,
      locationId: officeId,
    });
    returnRequestFindByIdMock.mockReturnValue(
      leanResult({ _id: "return-1", employee_id: "507f1f77bcf86cd799439024", office_id: officeId })
    );

    const next = vi.fn();
    await returnRequestController.getById(
      { params: { id: "return-1" }, user: { userId: "user-1", email: "user@test.com" } } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should reject create requests that mix returnAll with explicit asset ids", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "employee",
      isOrgAdmin: false,
      locationId: officeId,
      userId: "user-1",
    });

    const next = vi.fn();
    await returnRequestController.create(
      {
        body: {
          returnAll: true,
          assetItemIds: [assetItemId],
          employeeId,
          officeId,
        },
        user: { userId: "user-1", email: "user@test.com" },
      } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it("should reject non-manager users creating a return request for another employee", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "employee",
      isOrgAdmin: false,
      locationId: officeId,
      userId: "user-1",
    });

    const next = vi.fn();
    await returnRequestController.create(
      {
        body: {
          employeeId: "507f1f77bcf86cd799439030",
          officeId,
          assetItemIds: [assetItemId],
        },
        user: { userId: "user-1", email: "user@test.com" },
      } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should create a return request for valid self-service input and emit audit plus notifications", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "employee",
      isOrgAdmin: false,
      locationId: officeId,
      userId: "user-1",
    });

    const res = createResponse();
    await returnRequestController.create(
      {
        body: {
          employeeId,
          officeId,
          assetItemIds: [assetItemId],
        },
        user: { userId: "user-1", email: "user@test.com" },
      } as never,
      res as never,
      vi.fn()
    );

    expect(returnRequestCreateMock).toHaveBeenCalledWith({
      employee_id: employeeId,
      office_id: officeId,
      status: "SUBMITTED",
      lines: [{ asset_item_id: assetItemId }],
    });
    expect(logAuditMock).toHaveBeenCalled();
    expect(createBulkNotificationsMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: "507f1f77bcf86cd799439050",
      status: "SUBMITTED",
    });
  });
});
