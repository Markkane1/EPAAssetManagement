import { beforeEach, describe, expect, it, vi } from "vitest";

const categoryFindMock = vi.fn();
const categoryCountDocumentsMock = vi.fn();
const categoryFindByIdMock = vi.fn();
const categoryAggregateMock = vi.fn();
const assetAggregateMock = vi.fn();
const assetItemDistinctMock = vi.fn();
const consumableAggregateMock = vi.fn();
const resolveAccessContextMock = vi.fn();
const resolveConsumableRequestScopeMock = vi.fn();

vi.mock("../../server/src/models/category.model", () => ({
  CategoryModel: {
    find: (...args: unknown[]) => categoryFindMock(...args),
    countDocuments: (...args: unknown[]) => categoryCountDocumentsMock(...args),
    findById: (...args: unknown[]) => categoryFindByIdMock(...args),
    aggregate: (...args: unknown[]) => categoryAggregateMock(...args),
  },
}));

vi.mock("../../server/src/models/asset.model", () => ({
  AssetModel: {
    aggregate: (...args: unknown[]) => assetAggregateMock(...args),
  },
}));

vi.mock("../../server/src/models/assetItem.model", () => ({
  AssetItemModel: {
    distinct: (...args: unknown[]) => assetItemDistinctMock(...args),
  },
}));

vi.mock("../../server/src/modules/consumables/models/consumableItem.model", () => ({
  ConsumableItemModel: {
    aggregate: (...args: unknown[]) => consumableAggregateMock(...args),
  },
}));

vi.mock("../../server/src/utils/accessControl", () => ({
  resolveAccessContext: (...args: unknown[]) => resolveAccessContextMock(...args),
}));

vi.mock("../../server/src/modules/consumables/utils/accessScope", () => ({
  resolveConsumableRequestScope: (...args: unknown[]) => resolveConsumableRequestScopeMock(...args),
}));

import { categoryController } from "../../server/src/controllers/category.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("categoryController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveConsumableRequestScopeMock.mockResolvedValue({
      isGlobal: false,
      role: "office_head",
      locationId: "office-1",
      canAccessLabOnly: false,
    });
  });

  it("should exclude LAB_ONLY consumable categories for restricted readers", async () => {
    categoryFindMock.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [{ id: "cat-1", name: "General", asset_type: "CONSUMABLE", scope: "GENERAL" }],
          }),
        }),
      }),
    });

    const res = createResponse();
    await categoryController.list({ query: {} } as never, res as never, vi.fn());

    expect(categoryFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        $nor: expect.arrayContaining([
          expect.objectContaining({ scope: "LAB_ONLY", asset_type: "CONSUMABLE" }),
        ]),
      }),
      expect.any(Object)
    );
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "cat-1",
        name: "General",
        asset_type: "CONSUMABLE",
        scope: "GENERAL",
      }),
    ]);
  });

  it("should hide restricted LAB_ONLY consumable categories on getById", async () => {
    categoryFindByIdMock.mockReturnValue({
      lean: async () => ({ id: "cat-lab", scope: "LAB_ONLY", asset_type: "CONSUMABLE" }),
    });

    const res = createResponse();
    await categoryController.getById({ params: { id: "cat-lab" } } as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Not found" });
  });

  it("should exclude restricted consumable categories from counts for non-lab offices", async () => {
    resolveAccessContextMock.mockResolvedValue({
      userId: "user-1",
      role: "office_head",
      officeId: "office-1",
      isOrgAdmin: false,
    });
    assetItemDistinctMock.mockResolvedValue(["asset-1"]);
    assetAggregateMock.mockResolvedValue([{ _id: "cat-general", count: 2 }]);
    categoryFindMock.mockReturnValueOnce({
      lean: async () => [{ _id: "cat-general" }],
    });
    consumableAggregateMock.mockResolvedValue([{ _id: "cat-general", count: 4 }]);

    const res = createResponse();
    await categoryController.counts(
      { user: { userId: "user-1", role: "office_head" }, query: { ids: "507f1f77bcf86cd799439011,507f1f77bcf86cd799439012" } } as never,
      res as never,
      vi.fn()
    );

    expect(categoryFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        $nor: [{ scope: "LAB_ONLY", asset_type: "CONSUMABLE" }],
      }),
      { _id: 1 }
    );
    expect(consumableAggregateMock).toHaveBeenCalledWith([
      { $match: expect.objectContaining({ category_id: { $in: ["cat-general"] } }) },
      { $group: { _id: "$category_id", count: { $sum: 1 } } },
    ]);
    expect(res.json).toHaveBeenCalledWith({ assets: { "cat-general": 2 }, consumables: { "cat-general": 4 } });
  });
});
