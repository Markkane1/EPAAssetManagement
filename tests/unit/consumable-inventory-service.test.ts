import { beforeEach, describe, expect, it, vi } from "vitest";

const balanceFindOneMock = vi.fn();
const balanceFindMock = vi.fn();
const balanceAggregateMock = vi.fn();
const transactionFindMock = vi.fn();
const lotFindMock = vi.fn();
const userFindByIdMock = vi.fn();
const employeeFindMock = vi.fn();
const employeeFindOneMock = vi.fn();
const officeFindByIdMock = vi.fn();
const subLocationFindMock = vi.fn();
const resolveConsumablePermissionsMock = vi.fn();
const resolveConsumableCategoryScopeForItemMock = vi.fn();
const resolveLabOnlyConsumableItemIdsMock = vi.fn();
const resolveOfficeTypeByIdMock = vi.fn();
const officeSupportsLabOnlyMock = vi.fn();
const officeTypeSupportsLabOnlyMock = vi.fn();

vi.mock("../../server/src/models/user.model", () => ({
  UserModel: {
    findById: (...args: unknown[]) => userFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    findById: (...args: unknown[]) => officeFindByIdMock(...args),
  },
}));

vi.mock("../../server/src/models/employee.model", () => ({
  EmployeeModel: {
    find: (...args: unknown[]) => employeeFindMock(...args),
    findOne: (...args: unknown[]) => employeeFindOneMock(...args),
  },
}));

vi.mock("../../server/src/models/officeSubLocation.model", () => ({
  OfficeSubLocationModel: {
    find: (...args: unknown[]) => subLocationFindMock(...args),
    findById: vi.fn((id: string) => ({ session: async () => ({ id, office_id: "507f1f77bcf86cd799439021", name: "Section 1" }) })),
  },
}));

vi.mock("../../server/src/modules/consumables/models/consumableInventoryBalance.model", () => ({
  ConsumableInventoryBalanceModel: {
    findOne: (...args: unknown[]) => balanceFindOneMock(...args),
    find: (...args: unknown[]) => balanceFindMock(...args),
    aggregate: (...args: unknown[]) => balanceAggregateMock(...args),
  },
}));

vi.mock("../../server/src/modules/consumables/models/consumableInventoryTransaction.model", () => ({
  ConsumableInventoryTransactionModel: {
    find: (...args: unknown[]) => transactionFindMock(...args),
  },
}));

vi.mock("../../server/src/modules/consumables/models/consumableLot.model", () => ({
  ConsumableLotModel: {
    find: (...args: unknown[]) => lotFindMock(...args),
  },
}));

vi.mock("../../server/src/modules/consumables/utils/permissions", () => ({
  resolveConsumablePermissions: (...args: unknown[]) => resolveConsumablePermissionsMock(...args),
}));

vi.mock("../../server/src/modules/consumables/utils/labScope", () => ({
  officeSupportsLabOnly: (...args: unknown[]) => officeSupportsLabOnlyMock(...args),
  officeTypeSupportsLabOnly: (...args: unknown[]) => officeTypeSupportsLabOnlyMock(...args),
  resolveConsumableCategoryScopeForItem: (...args: unknown[]) => resolveConsumableCategoryScopeForItemMock(...args),
  resolveLabOnlyConsumableItemIds: (...args: unknown[]) => resolveLabOnlyConsumableItemIdsMock(...args),
  resolveOfficeTypeById: (...args: unknown[]) => resolveOfficeTypeByIdMock(...args),
}));

vi.mock("../../server/src/modules/consumables/utils/officeCapabilities", () => ({
  supportsChemicals: () => true,
}));

vi.mock("../../server/src/modules/consumables/services/consumableUnit.service", () => ({
  getUnitLookup: vi.fn(),
}));

vi.mock("../../server/src/modules/consumables/services/balance.service", () => ({
  roundQty: (value: number) => Number(value.toFixed(4)),
}));

vi.mock("../../server/src/modules/consumables/services/workflowNotification.service", () => ({
  dispatchConsumableWorkflowNotifications: vi.fn(),
  resolveOfficeIdsFromTransactions: vi.fn(),
}));

vi.mock("../../server/src/services/policyEngine.service", () => ({
  enforceAccessPolicy: vi.fn(),
}));

vi.mock("../../server/src/services/approvalMatrix.service", () => ({
  enforceApprovalMatrix: vi.fn(),
  markApprovalWorkflowExecuted: vi.fn(),
}));

vi.mock("../../server/src/models/activityLog.model", () => ({ ActivityLogModel: { create: vi.fn() } }));
vi.mock("../../server/src/models/store.model", () => ({ StoreModel: { findById: vi.fn(), findOne: vi.fn() } }));
vi.mock("../../server/src/models/category.model", () => ({ CategoryModel: { findById: vi.fn() } }));
vi.mock("../../server/src/models/vendor.model", () => ({ VendorModel: { findById: vi.fn() } }));
vi.mock("../../server/src/models/project.model", () => ({ ProjectModel: { findById: vi.fn() } }));
vi.mock("../../server/src/models/scheme.model", () => ({ SchemeModel: { findById: vi.fn() } }));
vi.mock("../../server/src/modules/consumables/models/consumableItem.model", () => ({ ConsumableItemModel: { findById: vi.fn() } }));
vi.mock("../../server/src/modules/consumables/models/consumableContainer.model", () => ({ ConsumableContainerModel: { findById: vi.fn() } }));
vi.mock("../../server/src/modules/consumables/models/consumableReasonCode.model", () => ({ ConsumableReasonCodeModel: { findById: vi.fn() } }));
vi.mock("../../server/src/modules/consumables/utils/httpError", async () => await vi.importActual("../../server/src/modules/consumables/utils/httpError"));
vi.mock("../../server/src/modules/consumables/utils/unitConversion", () => ({
  convertToBaseQty: vi.fn(),
  formatUom: (uom: string) => uom,
}));

import { inventoryService } from "../../server/src/modules/consumables/services/inventory.service";

function sessionQuery<T>(value: T) {
  return {
    session: () => value,
    lean: async () => value,
    sort: () => ({ session: () => value, lean: async () => value }),
  } as any;
}

function queryWithLean<T>(value: T) {
  return {
    session: () => ({ lean: async () => value }),
    lean: async () => value,
    sort: () => ({ session: () => ({ lean: async () => value }), lean: async () => value }),
  } as any;
}

describe("inventoryService reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveConsumablePermissionsMock.mockReturnValue({ canViewReports: true });
    userFindByIdMock.mockReturnValue({ session: async () => ({ location_id: "507f1f77bcf86cd799439021" }) });
    officeFindByIdMock.mockReturnValue({ session: async () => ({ id: "507f1f77bcf86cd799439021", name: "Office 1" }) });
    employeeFindOneMock.mockReturnValue({
      sort: () => ({ session: async () => ({ _id: "507f1f77bcf86cd799439011", location_id: "507f1f77bcf86cd799439021", allowed_sub_location_ids: ["507f1f77bcf86cd799439031"] }) }),
    });
    employeeFindMock.mockReturnValue({
      session: () => ({ lean: async () => [{ _id: "507f1f77bcf86cd799439011" }] }),
      lean: async () => [{ _id: "507f1f77bcf86cd799439011", location_id: "507f1f77bcf86cd799439021" }],
    });
    subLocationFindMock.mockReturnValue({
      session: () => ({ lean: async () => [{ _id: "507f1f77bcf86cd799439031", office_id: "507f1f77bcf86cd799439021" }] }),
      lean: async () => [{ _id: "507f1f77bcf86cd799439031", office_id: "507f1f77bcf86cd799439021" }],
    });
    resolveOfficeTypeByIdMock.mockResolvedValue(null);
    officeTypeSupportsLabOnlyMock.mockReturnValue(false);
    resolveLabOnlyConsumableItemIdsMock.mockResolvedValue([]);
    resolveConsumableCategoryScopeForItemMock.mockResolvedValue("STANDARD");
    officeSupportsLabOnlyMock.mockReturnValue(true);
  });

  it("should block employees from reading OFFICE holder balances directly", async () => {
    officeFindByIdMock.mockReturnValue({ session: async () => ({ id: "507f1f77bcf86cd799439021" }) });

    await expect(
      inventoryService.getBalance(
        { userId: "user-1", role: "employee", email: "emp@test.com", isOrgAdmin: false },
        { holderType: "OFFICE", holderId: "507f1f77bcf86cd799439021", itemId: "item-1" }
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("should unify lot-level balances into holder-item rows when lotId is not requested", async () => {
    balanceFindMock.mockReturnValue({
      sort: async () => [
        {
          holder_type: "OFFICE",
          holder_id: "507f1f77bcf86cd799439021",
          consumable_item_id: "item-1",
          lot_id: "lot-1",
          qty_on_hand_base: 5,
          qty_reserved_base: 1,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-02T00:00:00.000Z",
        },
        {
          holder_type: "OFFICE",
          holder_id: "507f1f77bcf86cd799439021",
          consumable_item_id: "item-1",
          lot_id: "lot-2",
          qty_on_hand_base: 3,
          qty_reserved_base: 0,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-03T00:00:00.000Z",
        },
      ],
    });

    const rows = await inventoryService.getBalances(
      { userId: "admin-1", role: "org_admin", email: "admin@test.com", isOrgAdmin: true },
      { holderType: "OFFICE", holderId: "507f1f77bcf86cd799439021", limit: 50, page: 1 }
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: "OFFICE:507f1f77bcf86cd799439021:item-1",
        holder_type: "OFFICE",
        holder_id: "507f1f77bcf86cd799439021",
        consumable_item_id: "item-1",
        qty_on_hand_base: 8,
        qty_reserved_base: 1,
        lot_count: 2,
      }),
    ]);
  });

  it("should scope ledger queries to the caller office and paginate results", async () => {
    transactionFindMock.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: async () => [{ id: "tx-1", tx_type: "TRANSFER" }],
        }),
      }),
    });

    const rows = await inventoryService.getLedger(
      { userId: "user-1", role: "caretaker", email: "care@test.com", isOrgAdmin: false },
      { holderType: "SUB_LOCATION", holderId: "507f1f77bcf86cd799439031", limit: 25, page: 2, txType: "TRANSFER" }
    );

    const filter = transactionFindMock.mock.calls[0]?.[0];
    expect(filter).toEqual(expect.objectContaining({ $and: expect.any(Array) }));
    const serialized = JSON.stringify(filter);
    expect(serialized).toContain("\"tx_type\":\"TRANSFER\"");
    expect(serialized).toContain("\"507f1f77bcf86cd799439031\"");
    expect(serialized).toContain("\"507f1f77bcf86cd799439021\"");
    expect(rows).toEqual([{ id: "tx-1", tx_type: "TRANSFER" }]);
  });

  it("should build expiry rows with resolved office ids for employee and section holders", async () => {
    balanceFindMock.mockReturnValue({
      limit: async () => [
        {
          holder_type: "SUB_LOCATION",
          holder_id: "507f1f77bcf86cd799439031",
          lot_id: "lot-1",
          qty_on_hand_base: 2,
        },
        {
          holder_type: "EMPLOYEE",
          holder_id: "507f1f77bcf86cd799439011",
          lot_id: "lot-2",
          qty_on_hand_base: 4,
        },
      ],
    });
    lotFindMock.mockResolvedValue([
      { id: "lot-1", consumable_id: "item-1", expiry_date: "2026-03-10T00:00:00.000Z" },
      { id: "lot-2", consumable_id: "item-2", expiry_date: "2026-03-08T00:00:00.000Z" },
    ]);
    subLocationFindMock.mockReturnValue({ lean: async () => [{ _id: "507f1f77bcf86cd799439031", office_id: "507f1f77bcf86cd799439021" }] });
    employeeFindMock.mockReturnValue({ lean: async () => [{ _id: "507f1f77bcf86cd799439011", location_id: "507f1f77bcf86cd799439021" }] });

    const rows = await inventoryService.getExpiry(
      { userId: "admin-1", role: "org_admin", email: "admin@test.com", isOrgAdmin: true },
      { days: 30, limit: 100 }
    );

    expect(rows).toEqual([
      expect.objectContaining({ lotId: "lot-2", locationId: "507f1f77bcf86cd799439021", qtyOnHandBase: 4 }),
      expect.objectContaining({ lotId: "lot-1", locationId: "507f1f77bcf86cd799439021", qtyOnHandBase: 2 }),
    ]);
  });

  it("should reject LAB_ONLY balance access for non-lab scoped offices", async () => {
    resolveLabOnlyConsumableItemIdsMock.mockResolvedValue(["item-lab"]);
    resolveConsumableCategoryScopeForItemMock.mockResolvedValue("LAB_ONLY");

    await expect(
      inventoryService.getBalance(
        { userId: "user-1", role: "caretaker", email: "care@test.com", isOrgAdmin: false },
        { holderType: "SUB_LOCATION", holderId: "507f1f77bcf86cd799439031", itemId: "item-lab" }
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("should aggregate rollup rows by item and holder", async () => {
    balanceAggregateMock.mockResolvedValue([
      {
        _id: { itemId: "item-1", holderType: "OFFICE", holderId: "507f1f77bcf86cd799439021" },
        qty_on_hand_base: 8,
      },
      {
        _id: { itemId: "item-1", holderType: "EMPLOYEE", holderId: "507f1f77bcf86cd799439011" },
        qty_on_hand_base: 2,
      },
    ]);

    const rows = await inventoryService.getRollup(
      { userId: "admin-1", role: "org_admin", email: "admin@test.com", isOrgAdmin: true },
      {}
    );

    expect(rows).toEqual([
      expect.objectContaining({
        itemId: "item-1",
        totalQtyBase: 10,
        byLocation: [{ locationId: "507f1f77bcf86cd799439021", qtyOnHandBase: 8 }],
        byHolder: expect.arrayContaining([
          expect.objectContaining({ holderType: "OFFICE", holderId: "507f1f77bcf86cd799439021", qtyOnHandBase: 8 }),
          expect.objectContaining({ holderType: "EMPLOYEE", holderId: "507f1f77bcf86cd799439011", qtyOnHandBase: 2 }),
        ]),
      }),
    ]);
  });
});
