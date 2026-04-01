import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

vi.mock("../../server/src/models/user.model", () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

vi.mock("../../server/src/models/asset.model", () => ({
  AssetModel: {
    findById: vi.fn(),
  },
}));

vi.mock("../../server/src/models/category.model", () => ({
  CategoryModel: {
    findById: vi.fn(),
  },
}));

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    findById: vi.fn(),
  },
}));

import { UserModel } from "../../server/src/models/user.model";
import { AssetModel } from "../../server/src/models/asset.model";
import { CategoryModel } from "../../server/src/models/category.model";
import { OfficeModel } from "../../server/src/models/office.model";
import {
  ensureOfficeScope,
  isOfficeManager,
  resolveAccessContext,
} from "../../server/src/utils/accessControl";
import {
  getAssetItemHolder,
  getAssetItemOfficeId,
  isAssetItemHeldByOffice,
  officeAssetItemFilter,
  setAssetItemOfficeHolderUpdate,
  setAssetItemStoreHolderUpdate,
} from "../../server/src/utils/assetHolder";
import {
  LAB_ONLY_CATEGORY_ERROR_MESSAGE,
  enforceAssetCategoryScopeForOffice,
} from "../../server/src/utils/categoryScope";
import { buildOfficeFilter, getRequestContext } from "../../server/src/utils/scope";

describe("access control helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should identify office manager roles correctly", () => {
    expect(isOfficeManager("office_head")).toBe(true);
    expect(isOfficeManager("storekeeper")).toBe(true);
    expect(isOfficeManager("employee")).toBe(false);
    expect(isOfficeManager("")).toBe(false);
  });

  it("should resolve access context from the database when the user exists", async () => {
    vi.mocked(UserModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        _id: "user-1",
        location_id: new Types.ObjectId("507f1f77bcf86cd799439011"),
      }),
    } as never);

    const ctx = await resolveAccessContext({
      userId: "user-1",
      role: "office_head",
      locationId: null,
      isOrgAdmin: false,
    } as never);

    expect(ctx).toEqual({
      userId: "user-1",
      role: "office_head",
      officeId: "507f1f77bcf86cd799439011",
      isOrgAdmin: false,
    });
  });

  it("should throw when access context is resolved without a user or with a missing user document", async () => {
    await expect(resolveAccessContext(undefined)).rejects.toMatchObject({
      status: 401,
    });

    vi.mocked(UserModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(
      resolveAccessContext({
        userId: "missing",
        role: "employee",
        locationId: null,
        isOrgAdmin: false,
      } as never)
    ).rejects.toMatchObject({ status: 401 });
  });

  it("should enforce office scope only when the context is not global", () => {
    expect(() =>
      ensureOfficeScope(
        { userId: "1", role: "org_admin", officeId: null, isOrgAdmin: true },
        "office-1"
      )
    ).not.toThrow();

    expect(() =>
      ensureOfficeScope(
        { userId: "1", role: "employee", officeId: null, isOrgAdmin: false },
        "office-1"
      )
    ).toThrowError(/assigned to an office/i);

    expect(() =>
      ensureOfficeScope(
        { userId: "1", role: "employee", officeId: "office-2", isOrgAdmin: false },
        "office-1"
      )
    ).toThrowError(/assigned office/i);
  });
});

describe("asset holder helpers", () => {
  it("should resolve office holder data for typical office-held items", () => {
    const officeId = new Types.ObjectId("507f1f77bcf86cd799439012");
    const item = { holder_type: "OFFICE", holder_id: officeId };

    expect(getAssetItemOfficeId(item)).toBe(officeId.toString());
    expect(getAssetItemHolder(item)).toEqual({
      holderType: "OFFICE",
      holderId: officeId.toString(),
    });
    expect(isAssetItemHeldByOffice(item, officeId.toString())).toBe(true);
  });

  it("should resolve store holder data and reject unsupported holder types", () => {
    expect(
      getAssetItemHolder({
        holder_type: "STORE",
        holder_id: "store-1",
      })
    ).toEqual({
      holderType: "STORE",
      holderId: "store-1",
    });

    expect(getAssetItemOfficeId({ holder_type: "STORE", holder_id: "x" })).toBeNull();
    expect(getAssetItemHolder({ holder_type: "USER", holder_id: "x" })).toBeNull();
    expect(getAssetItemHolder({ holder_type: "OFFICE", holder_id: null })).toBeNull();
  });

  it("should build standard holder filters and updates", () => {
    expect(officeAssetItemFilter("office-1")).toEqual({
      holder_type: "OFFICE",
      holder_id: "office-1",
    });
    expect(setAssetItemOfficeHolderUpdate("office-2")).toEqual({
      holder_type: "OFFICE",
      holder_id: "office-2",
    });
    expect(setAssetItemStoreHolderUpdate("store-2")).toEqual({
      holder_type: "STORE",
      holder_id: "store-2",
    });
  });
});

describe("category scope helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow assets without categories or non-lab categories", async () => {
    vi.mocked(AssetModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ category_id: null }),
    } as never);
    await expect(
      enforceAssetCategoryScopeForOffice("asset-1", "office-1")
    ).resolves.toBeUndefined();

    vi.mocked(AssetModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        category_id: "cat-1",
      }),
    } as never);
    vi.mocked(CategoryModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        scope: "GENERAL",
      }),
    } as never);

    await expect(
      enforceAssetCategoryScopeForOffice("asset-2", "office-1")
    ).resolves.toBeUndefined();
  });

  it("should reject lab-only assets for non-lab offices and allow them for district labs", async () => {
    vi.mocked(AssetModel.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        category_id: "cat-1",
      }),
    } as never);
    vi.mocked(CategoryModel.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        scope: "LAB_ONLY",
      }),
    } as never);

    vi.mocked(OfficeModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        type: "DISTRICT_OFFICE",
      }),
    } as never);

    await expect(
      enforceAssetCategoryScopeForOffice("asset-3", "office-1")
    ).rejects.toMatchObject({
      status: 400,
      message: LAB_ONLY_CATEGORY_ERROR_MESSAGE,
    });

    vi.mocked(OfficeModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        type: "DISTRICT_LAB",
      }),
    } as never);

    await expect(
      enforceAssetCategoryScopeForOffice("asset-3", "office-2")
    ).resolves.toBeUndefined();
  });

  it("should throw not found errors when the asset or office does not exist", async () => {
    vi.mocked(AssetModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue(null),
    } as never);
    await expect(
      enforceAssetCategoryScopeForOffice("missing-asset", "office-1")
    ).rejects.toMatchObject({ status: 404 });

    vi.mocked(AssetModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        category_id: "cat-1",
      }),
    } as never);
    vi.mocked(CategoryModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({
        scope: "LAB_ONLY",
      }),
    } as never);
    vi.mocked(OfficeModel.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(
      enforceAssetCategoryScopeForOffice("asset-1", "missing-office")
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("request scope helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build and cache request context for authenticated requests", async () => {
    const req = {
      user: {
        userId: "user-1",
        role: "office_head",
        activeRole: "office_head",
        roles: ["office_head"],
        locationId: "office-1",
        isOrgAdmin: false,
      },
    } as never;

    const first = await getRequestContext(req);
    const second = await getRequestContext(req);

    expect(first).toEqual({
      userId: "user-1",
      role: "office_head",
      activeRole: "office_head",
      roles: ["office_head"],
      locationId: "office-1",
      isOrgAdmin: false,
    });
    expect(second).toBe(first);
  });

  it("should fetch the office id from the user document when it is missing in the token", async () => {
    vi.mocked(UserModel.findById).mockResolvedValueOnce({
      location_id: new Types.ObjectId("507f1f77bcf86cd799439099"),
    } as never);

    const ctx = await getRequestContext({
      user: {
        userId: "user-1",
        role: "employee",
        activeRole: "employee",
        roles: ["employee"],
      },
    } as never);

    expect(ctx.locationId).toBe("507f1f77bcf86cd799439099");
  });

  it("should throw for unauthenticated requests or missing users and should build office filters", async () => {
    await expect(getRequestContext({} as never)).rejects.toMatchObject({
      status: 401,
    });

    vi.mocked(UserModel.findById).mockResolvedValueOnce(null as never);

    await expect(
      getRequestContext({
        user: {
          userId: "missing",
          role: "employee",
        },
      } as never)
    ).rejects.toMatchObject({ status: 401 });

    expect(
      buildOfficeFilter({
        userId: "1",
        role: "org_admin",
        locationId: null,
        isOrgAdmin: true,
      })
    ).toBeNull();

    expect(() =>
      buildOfficeFilter({
        userId: "1",
        role: "employee",
        locationId: null,
        isOrgAdmin: false,
      })
    ).toThrowError(/assigned to an office/i);

    expect(
      buildOfficeFilter({
        userId: "1",
        role: "employee",
        locationId: "office-1",
        isOrgAdmin: false,
      })
    ).toEqual({ office_id: "office-1" });
  });
});
