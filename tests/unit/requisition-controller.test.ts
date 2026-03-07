import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestContextMock = vi.fn();
const requisitionFindMock = vi.fn();
const requisitionFindByIdMock = vi.fn();
const requisitionCountMock = vi.fn();
const requisitionLineFindMock = vi.fn();
const officeFindByIdMock = vi.fn();
const loadStoredRolePermissionsContextMock = vi.fn();
const resolveStoredRolePermissionEntryMock = vi.fn();
const resolveStoredRolePageActionsMock = vi.fn();
const hasPermissionActionMock = vi.fn();
const assertUploadedFileIntegrityMock = vi.fn();

vi.mock("../../server/src/utils/scope", () => ({
  getRequestContext: (...args: unknown[]) => getRequestContextMock(...args),
}));

vi.mock("../../server/src/models/requisition.model", () => ({
  RequisitionModel: {
    find: (...args: unknown[]) => requisitionFindMock(...args),
    findById: (...args: unknown[]) => requisitionFindByIdMock(...args),
    countDocuments: (...args: unknown[]) => requisitionCountMock(...args),
  },
}));

vi.mock("../../server/src/models/requisitionLine.model", () => ({
  RequisitionLineModel: {
    find: (...args: unknown[]) => requisitionLineFindMock(...args),
  },
}));

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    findById: (...args: unknown[]) => officeFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/utils/rolePermissions", () => ({
  loadStoredRolePermissionsContext: (...args: unknown[]) => loadStoredRolePermissionsContextMock(...args),
  resolveStoredRolePermissionEntry: (...args: unknown[]) => resolveStoredRolePermissionEntryMock(...args),
  resolveStoredRolePageActions: (...args: unknown[]) => resolveStoredRolePageActionsMock(...args),
  hasPermissionAction: (...args: unknown[]) => hasPermissionActionMock(...args),
}));

vi.mock("../../server/src/utils/uploadValidation", () => ({
  assertUploadedFileIntegrity: (...args: unknown[]) => assertUploadedFileIntegrityMock(...args),
}));

vi.mock("../../server/src/controllers/requisition.controller.helpers", async () => {
  const actual = await vi.importActual<any>("../../server/src/controllers/requisition.controller.helpers");
  return {
    ...actual,
    enrichLinesWithMappingMetadata: async (lines: unknown[]) => lines,
  };
});

import { requisitionController } from "../../server/src/controllers/requisition.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requisitionController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadStoredRolePermissionsContextMock.mockResolvedValue({});
    resolveStoredRolePermissionEntryMock.mockReturnValue(null);
    resolveStoredRolePageActionsMock.mockReturnValue([]);
    hasPermissionActionMock.mockReturnValue(false);
    requisitionCountMock.mockResolvedValue(1);
    requisitionFindByIdMock.mockReturnValue({ lean: async () => null });
    requisitionLineFindMock.mockReturnValue({ lean: async () => [] });
    requisitionFindMock.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [{ _id: "req-1", file_number: "REQ-001" }],
          }),
        }),
      }),
    });
  });

  it("should reject requisition listing when the office head requests a non-submitted status", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "office_head",
      isOrgAdmin: false,
      locationId: "507f1f77bcf86cd799439021",
      userId: "user-1",
    });

    const next = vi.fn();
    await requisitionController.list(
      {
        query: { status: "FULFILLED" },
      } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should return paginated requisitions for scoped employees", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "employee",
      isOrgAdmin: false,
      locationId: "507f1f77bcf86cd799439021",
      userId: "507f1f77bcf86cd799439011",
    });

    const res = createResponse();
    await requisitionController.list(
      {
        query: {
          page: "2",
          limit: "25",
          fileNumber: "REQ",
          from: "2026-03-01",
          to: "2026-03-05",
        },
      } as never,
      res as never,
      vi.fn()
    );

    expect(requisitionFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        office_id: "507f1f77bcf86cd799439021",
        submitted_by_user_id: "507f1f77bcf86cd799439011",
        file_number: expect.objectContaining({ $options: "i" }),
      })
    );
    expect(requisitionCountMock).toHaveBeenCalledWith(
      expect.objectContaining({ office_id: "507f1f77bcf86cd799439021" })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ _id: "req-1", file_number: "REQ-001" }),
        ]),
        page: 2,
        limit: 25,
        total: 1,
      })
    );
  });

  it("should reject requisition creation when the role cannot submit", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "caretaker",
      isOrgAdmin: false,
      locationId: "507f1f77bcf86cd799439021",
      userId: "user-1",
    });

    const next = vi.fn();
    await requisitionController.create(
      {
        body: {},
        file: undefined,
      } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(assertUploadedFileIntegrityMock).not.toHaveBeenCalled();
  });

  it("should reject requisition creation when the uploaded file is missing", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "employee",
      isOrgAdmin: false,
      locationId: "507f1f77bcf86cd799439021",
      userId: "user-1",
    });

    const next = vi.fn();
    await requisitionController.create(
      {
        body: {},
        file: undefined,
      } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(officeFindByIdMock).not.toHaveBeenCalled();
  });

  it("should return 404 when a requisition detail lookup misses", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "org_admin",
      isOrgAdmin: true,
      locationId: null,
      userId: "admin-1",
    });

    const next = vi.fn();
    await requisitionController.getById(
      { params: { id: "507f1f77bcf86cd799439041" } } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("should reject mapping when requisition ids are invalid", async () => {
    getRequestContextMock.mockResolvedValue({
      role: "office_head",
      isOrgAdmin: false,
      locationId: "507f1f77bcf86cd799439021",
      userId: "user-1",
    });

    const next = vi.fn();
    await requisitionController.mapLine(
      {
        params: { id: "bad-id", lineId: "also-bad" },
        body: {},
      } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });
});
