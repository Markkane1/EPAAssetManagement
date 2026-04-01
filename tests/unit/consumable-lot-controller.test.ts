import { beforeEach, describe, expect, it, vi } from "vitest";

const lotFindMock = vi.fn();
const lotFindByIdMock = vi.fn();
const balanceDistinctMock = vi.fn();
const balanceExistsMock = vi.fn();
const ensureScopeItemAccessMock = vi.fn();
const resolveConsumableRequestScopeMock = vi.fn();
const resolveScopeLabOnlyRestrictionsMock = vi.fn();
const resolveOfficeScopedHolderIdsMock = vi.fn();
const resolveEmployeeScopedHolderIdsMock = vi.fn();

vi.mock("../../server/src/modules/consumables/models/consumableLot.model", () => ({
  ConsumableLotModel: {
    find: (...args: unknown[]) => lotFindMock(...args),
    findById: (...args: unknown[]) => lotFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/modules/consumables/models/consumableInventoryBalance.model", () => ({
  ConsumableInventoryBalanceModel: {
    distinct: (...args: unknown[]) => balanceDistinctMock(...args),
    exists: (...args: unknown[]) => balanceExistsMock(...args),
  },
}));

vi.mock("../../server/src/modules/consumables/utils/accessScope", () => ({
  buildEmployeeScopedBalanceFilter: (scope: unknown) => ({
    $or: [
      { holder_type: "EMPLOYEE", holder_id: (scope as { employeeId: string }).employeeId },
      { holder_type: "SUB_LOCATION", holder_id: { $in: (scope as { subLocationIds: string[] }).subLocationIds } },
    ],
  }),
  buildOfficeScopedBalanceFilter: (scope: unknown) => ({
    $or: [
      { holder_type: "OFFICE", holder_id: (scope as { officeId: string }).officeId },
      { holder_type: "SUB_LOCATION", holder_id: { $in: (scope as { subLocationIds: string[] }).subLocationIds } },
      { holder_type: "EMPLOYEE", holder_id: { $in: (scope as { employeeIds: string[] }).employeeIds } },
    ],
  }),
  isHolderInEmployeeScope: (holderType: string, holderId: string, scope: { employeeId: string; subLocationIds: string[] }) =>
    (holderType === "EMPLOYEE" && holderId === scope.employeeId) ||
    (holderType === "SUB_LOCATION" && scope.subLocationIds.includes(holderId)),
  isHolderInOfficeScope: (holderType: string, holderId: string, scope: { officeId: string; subLocationIds: string[]; employeeIds: string[] }) =>
    (holderType === "OFFICE" && holderId === scope.officeId) ||
    (holderType === "SUB_LOCATION" && scope.subLocationIds.includes(holderId)) ||
    (holderType === "EMPLOYEE" && scope.employeeIds.includes(holderId)),
  ensureScopeItemAccess: (...args: unknown[]) => ensureScopeItemAccessMock(...args),
  resolveConsumableRequestScope: (...args: unknown[]) => resolveConsumableRequestScopeMock(...args),
  resolveEmployeeScopedHolderIds: (...args: unknown[]) => resolveEmployeeScopedHolderIdsMock(...args),
  resolveOfficeScopedHolderIds: (...args: unknown[]) => resolveOfficeScopedHolderIdsMock(...args),
  resolveScopeLabOnlyRestrictions: (...args: unknown[]) => resolveScopeLabOnlyRestrictionsMock(...args),
}));

import { consumableLotController } from "../../server/src/modules/consumables/controllers/consumableLot.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("consumableLotController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveScopeLabOnlyRestrictionsMock.mockResolvedValue({ labOnlyCategoryIds: [], labOnlyItemIds: [] });
    ensureScopeItemAccessMock.mockResolvedValue(undefined);
  });

  it("should scope office lot reads through office, section, and employee balances", async () => {
    resolveConsumableRequestScopeMock.mockResolvedValue({
      isGlobal: false,
      role: "caretaker",
      locationId: "office-1",
      canAccessLabOnly: true,
    });
    resolveOfficeScopedHolderIdsMock.mockResolvedValue({
      officeId: "office-1",
      subLocationIds: ["section-1"],
      employeeIds: ["employee-1"],
    });
    balanceDistinctMock.mockResolvedValue(["lot-1"]);
    lotFindMock.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [{ id: "lot-1", consumable_id: "item-1" }],
          }),
        }),
      }),
    });

    const res = createResponse();
    await consumableLotController.list(
      { user: { role: "caretaker", userId: "user-1" }, query: { holder_type: "SUB_LOCATION", holder_id: "section-1" } } as never,
      res as never,
      vi.fn()
    );

    expect(balanceDistinctMock).toHaveBeenCalledWith(
      "lot_id",
      expect.objectContaining({
        $and: expect.any(Array),
      })
    );
    const serializedFilter = JSON.stringify(balanceDistinctMock.mock.calls[0]?.[1]);
    expect(serializedFilter).toContain("\"office-1\"");
    expect(serializedFilter).toContain("\"section-1\"");
    expect(serializedFilter).toContain("\"employee-1\"");
    expect(res.json).toHaveBeenCalledWith([{ id: "lot-1", consumable_id: "item-1" }]);
  });

  it("should reject employees requesting office holder lots", async () => {
    resolveConsumableRequestScopeMock.mockResolvedValue({
      isGlobal: false,
      role: "employee",
      locationId: "office-1",
      canAccessLabOnly: true,
    });
    resolveEmployeeScopedHolderIdsMock.mockResolvedValue({
      employeeId: "employee-1",
      subLocationIds: ["section-1"],
    });

    const next = vi.fn();
    await consumableLotController.list(
      { user: { role: "employee", userId: "user-1" }, query: { holder_type: "OFFICE", holder_id: "office-1" } } as never,
      createResponse() as never,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(balanceDistinctMock).not.toHaveBeenCalled();
  });

  it("should exclude restricted LAB_ONLY item balances for non-lab offices", async () => {
    resolveConsumableRequestScopeMock.mockResolvedValue({
      isGlobal: false,
      role: "office_head",
      locationId: "office-1",
      canAccessLabOnly: false,
    });
    resolveOfficeScopedHolderIdsMock.mockResolvedValue({
      officeId: "office-1",
      subLocationIds: [],
      employeeIds: [],
    });
    resolveScopeLabOnlyRestrictionsMock.mockResolvedValue({
      labOnlyCategoryIds: ["cat-lab"],
      labOnlyItemIds: ["item-lab"],
    });
    balanceDistinctMock.mockResolvedValue([]);

    const res = createResponse();
    await consumableLotController.list(
      { user: { role: "office_head", userId: "user-1" }, query: {} } as never,
      res as never,
      vi.fn()
    );

    expect(balanceDistinctMock).toHaveBeenCalledWith("lot_id", expect.objectContaining({ $and: expect.any(Array) }));
    const serializedFilter = JSON.stringify(balanceDistinctMock.mock.calls[0]?.[1]);
    expect(serializedFilter).toContain("\"item-lab\"");
    expect(serializedFilter).toContain("\"qty_on_hand_base\":{\"$gt\":0}");
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("should deny lot detail access when no scoped balance exists", async () => {
    resolveConsumableRequestScopeMock.mockResolvedValue({
      isGlobal: false,
      role: "office_head",
      locationId: "office-1",
      canAccessLabOnly: true,
    });
    resolveOfficeScopedHolderIdsMock.mockResolvedValue({
      officeId: "office-1",
      subLocationIds: ["section-1"],
      employeeIds: ["employee-1"],
    });
    lotFindByIdMock.mockReturnValue({
      lean: async () => ({ _id: "lot-1", consumable_id: "item-1" }),
    });
    balanceExistsMock.mockResolvedValue(null);

    const next = vi.fn();
    await consumableLotController.getById(
      { user: { role: "office_head", userId: "user-1" }, params: { id: "lot-1" } } as never,
      createResponse() as never,
      next
    );

    expect(balanceExistsMock).toHaveBeenCalledWith(expect.objectContaining({ $and: expect.any(Array) }));
    expect(JSON.stringify(balanceExistsMock.mock.calls[0]?.[0])).toContain("\"lot_id\":\"lot-1\"");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should return lot detail when a scoped balance exists", async () => {
    resolveConsumableRequestScopeMock.mockResolvedValue({
      isGlobal: false,
      role: "employee",
      locationId: "office-1",
      canAccessLabOnly: true,
    });
    resolveEmployeeScopedHolderIdsMock.mockResolvedValue({
      employeeId: "employee-1",
      subLocationIds: ["section-1"],
    });
    lotFindByIdMock.mockReturnValue({
      lean: async () => ({ _id: "lot-2", consumable_id: "item-2" }),
    });
    balanceExistsMock.mockResolvedValue({ _id: "balance-1" });

    const res = createResponse();
    await consumableLotController.getById(
      { user: { role: "employee", userId: "user-1" }, params: { id: "lot-2" } } as never,
      res as never,
      vi.fn()
    );

    expect(balanceExistsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.any(Array),
      })
    );
    expect(res.json).toHaveBeenCalledWith({ _id: "lot-2", consumable_id: "item-2" });
  });
});
