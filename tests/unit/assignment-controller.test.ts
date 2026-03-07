import { beforeEach, describe, expect, it, vi } from "vitest";

const endSessionMock = vi.fn();

vi.mock("mongoose", async () => {
  const actual = await vi.importActual<any>("mongoose");
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn(async () => ({
        endSession: endSessionMock,
        withTransaction: async (handler: (session: unknown) => Promise<void>) => handler({}),
      })),
    },
    startSession: vi.fn(async () => ({
      endSession: endSessionMock,
      withTransaction: async (handler: (session: unknown) => Promise<void>) => handler({}),
    })),
  };
});

const resolveAccessContextMock = vi.fn();
const ensureOfficeScopeMock = vi.fn();
const assignmentFindMock = vi.fn();
const assignmentFindByIdMock = vi.fn();
const assignmentUpdateOneMock = vi.fn();
const assetItemDistinctMock = vi.fn();
const assetItemFindByIdMock = vi.fn();
const employeeFindOneMock = vi.fn();
const employeeFindByIdMock = vi.fn();
const ensureAssignmentAssetScopeMock = vi.fn();

vi.mock("../../server/src/utils/accessControl", () => ({
  resolveAccessContext: (...args: unknown[]) => resolveAccessContextMock(...args),
  ensureOfficeScope: (...args: unknown[]) => ensureOfficeScopeMock(...args),
  isOfficeManager: (role: string) => role === "office_head" || role === "caretaker",
}));

vi.mock("../../server/src/models/assignment.model", () => ({
  AssignmentModel: {
    find: (...args: unknown[]) => assignmentFindMock(...args),
    findById: (...args: unknown[]) => assignmentFindByIdMock(...args),
    updateOne: (...args: unknown[]) => assignmentUpdateOneMock(...args),
  },
}));

vi.mock("../../server/src/models/assetItem.model", () => ({
  AssetItemModel: {
    distinct: (...args: unknown[]) => assetItemDistinctMock(...args),
    findById: (...args: unknown[]) => assetItemFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/models/employee.model", () => ({
  EmployeeModel: {
    findOne: (...args: unknown[]) => employeeFindOneMock(...args),
    findById: (...args: unknown[]) => employeeFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/controllers/assignment.controller.helpers", () => ({
  OPEN_ASSIGNMENT_STATUSES: ["Issued"],
  RETURN_SLIP_ALLOWED_STATUSES: ["Issued"],
  ASSIGNED_TO_TYPES: ["EMPLOYEE", "SUB_LOCATION"],
  fieldMap: {},
  readParam: (req: any, key: string) => req.params?.[key],
  clampInt: (value: unknown, fallback: number) => Number(value || fallback),
  asNonEmptyString: (value: unknown) => String(value || "").trim(),
  asNullableString: (value: unknown) => (value == null ? null : String(value)),
  ensureObjectId: vi.fn(),
  toIdString: (value: unknown) => String(value || ""),
  buildPayload: vi.fn(),
  requireAssetItemOfficeId: vi.fn(),
  toRequestContext: vi.fn(),
  resolveStoredFileAbsolutePath: vi.fn(),
  getUploadedFile: vi.fn(),
  ensureAssignmentAssetScope: (...args: unknown[]) => ensureAssignmentAssetScopeMock(...args),
  resolveNotificationOfficeId: vi.fn(),
  resolveNotificationRecipients: vi.fn(),
  notifyAssignmentEvent: vi.fn(),
  resolveGeneratedSlipFile: vi.fn(),
}));

import { assignmentController } from "../../server/src/controllers/assignment.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function queryResult<T>(value: T) {
  return {
    sort: () => ({
      skip: () => ({
        limit: async () => value,
      }),
    }),
  };
}

describe("assignmentController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    employeeFindOneMock.mockReturnValue({ lean: async () => ({ _id: "employee-1" }) });
    assignmentFindMock.mockReturnValue(queryResult([{ id: "assignment-1" }]));
    ensureAssignmentAssetScopeMock.mockResolvedValue(undefined);
    ensureOfficeScopeMock.mockImplementation(() => undefined);
    assignmentUpdateOneMock.mockResolvedValue({ acknowledged: true });
  });

  it("should list only employee-owned assignments for employee users", async () => {
    resolveAccessContextMock.mockResolvedValue({
      isOrgAdmin: false,
      role: "employee",
      userId: "user-1",
      officeId: "office-1",
    });

    const res = createResponse();
    await assignmentController.list(
      { user: { userId: "user-1" }, query: { limit: "25", page: "2" } } as never,
      res as never,
      vi.fn()
    );

    expect(assignmentFindMock).toHaveBeenCalledWith({
      $or: [
        { employee_id: "employee-1" },
        { assigned_to_type: "EMPLOYEE", assigned_to_id: "employee-1" },
      ],
    });
    expect(res.json).toHaveBeenCalledWith([{ id: "assignment-1" }]);
  });

  it("should return 404 when an assignment is missing", async () => {
    resolveAccessContextMock.mockResolvedValue({ isOrgAdmin: true, role: "org_admin", userId: "user-1" });
    assignmentFindByIdMock.mockResolvedValue(null);

    const res = createResponse();
    await assignmentController.getById(
      { params: { id: "assignment-1" }, user: { userId: "user-1" } } as never,
      res as never,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Not found" });
  });

  it("should block employees from reading another employee's assignments", async () => {
    resolveAccessContextMock.mockResolvedValue({
      isOrgAdmin: false,
      role: "employee",
      userId: "user-1",
      officeId: "office-1",
    });

    const next = vi.fn();
    await assignmentController.getByEmployee(
      { params: { employeeId: "employee-2" }, query: {}, user: { userId: "user-1" } } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should reject assignment creation for non-manager roles", async () => {
    resolveAccessContextMock.mockResolvedValue({
      isOrgAdmin: false,
      role: "employee",
      userId: "user-1",
      officeId: "office-1",
    });

    const next = vi.fn();
    await assignmentController.create(
      { body: {} } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(endSessionMock).toHaveBeenCalled();
  });

  it("should scope getByAssetItem to employee-owned assignments for employee users", async () => {
    resolveAccessContextMock.mockResolvedValue({
      isOrgAdmin: false,
      role: "employee",
      userId: "user-1",
      officeId: "office-1",
    });

    const res = createResponse();
    await assignmentController.getByAssetItem(
      { params: { assetItemId: "asset-1" }, query: {}, user: { userId: "user-1" } } as never,
      res as never,
      vi.fn()
    );

    expect(assignmentFindMock).toHaveBeenCalledWith({
      asset_item_id: "asset-1",
      $or: [
        { employee_id: "employee-1" },
        { assigned_to_type: "EMPLOYEE", assigned_to_id: "employee-1" },
      ],
    });
    expect(res.json).toHaveBeenCalledWith([{ id: "assignment-1" }]);
  });

  it("should cancel an assignment and return 204 for office managers", async () => {
    resolveAccessContextMock.mockResolvedValue({
      isOrgAdmin: false,
      role: "office_head",
      userId: "user-1",
      officeId: "office-1",
    });
    assignmentFindByIdMock.mockResolvedValue({ _id: "assignment-1", id: "assignment-1" });
    ensureAssignmentAssetScopeMock.mockResolvedValue({ officeId: "office-1" });

    const res = createResponse();
    res.send = vi.fn().mockReturnValue(res);
    await assignmentController.remove(
      { params: { id: "assignment-1" }, user: { userId: "user-1" } } as never,
      res as never,
      vi.fn()
    );

    expect(assignmentUpdateOneMock).toHaveBeenCalledWith(
      { _id: "assignment-1" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "CANCELLED", is_active: false }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
