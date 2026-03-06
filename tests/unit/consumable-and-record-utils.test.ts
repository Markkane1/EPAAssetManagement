import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/src/models/counter.model", () => ({
  CounterModel: {
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    findById: vi.fn(),
  },
}));

vi.mock("../../server/src/models/category.model", () => ({
  CategoryModel: {
    findById: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("../../server/src/modules/consumables/models/consumableItem.model", () => ({
  ConsumableItemModel: {
    findById: vi.fn(),
    find: vi.fn(),
  },
}));

import { CounterModel } from "../../server/src/models/counter.model";
import { OfficeModel } from "../../server/src/models/office.model";
import { CategoryModel } from "../../server/src/models/category.model";
import { ConsumableItemModel } from "../../server/src/modules/consumables/models/consumableItem.model";
import {
  getAllowedUploadMimeTypes,
  isAllowedUploadExtension,
  isAllowedUploadMimeType,
} from "../../server/src/utils/uploadValidation";
import {
  ALLOWED_TRANSITIONS,
  APPROVAL_REQUIRED,
  REQUIRED_DOCUMENTS,
} from "../../server/src/modules/records/utils/transitions";
import {
  generateReference,
  getOfficeCode,
} from "../../server/src/modules/records/utils/reference";
import {
  buildUnitLookup,
  convertToBaseQty,
  formatUom,
  getUomType,
  isCompatibleUom,
  normalizeUom,
} from "../../server/src/modules/consumables/utils/unitConversion";
import {
  officeSupportsLabOnly,
  officeTypeSupportsLabOnly,
  resolveConsumableCategoryScopeByCategoryId,
  resolveConsumableCategoryScopeForItem,
  resolveLabOnlyCategoryIds,
  resolveLabOnlyConsumableItemIds,
  resolveOfficeTypeById,
} from "../../server/src/modules/consumables/utils/labScope";
import {
  ensureScopeCategoryAccess,
  ensureScopeItemAccess,
  ensureScopeOfficeAccess,
  resolveConsumableRequestScope,
  resolveScopeLabOnlyRestrictions,
} from "../../server/src/modules/consumables/utils/accessScope";
import { resolveConsumablePermissions } from "../../server/src/modules/consumables/utils/permissions";
import {
  supportsChemicals,
  supportsConsumables,
  supportsMoveables,
} from "../../server/src/modules/consumables/utils/officeCapabilities";

function createQueryMock<T>(value: T) {
  const query = {
    session: vi.fn(),
    lean: vi.fn(),
  };
  query.session.mockReturnValue(query);
  query.lean.mockResolvedValue(value);
  return query;
}

describe("upload validation helpers", () => {
  it("should expose allowed upload MIME types and validate matching extensions", () => {
    expect(getAllowedUploadMimeTypes()).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
    ]);
    expect(isAllowedUploadMimeType("application/pdf")).toBe(true);
    expect(isAllowedUploadMimeType("text/plain")).toBe(false);
    expect(isAllowedUploadExtension("report.pdf", "application/pdf")).toBe(true);
    expect(isAllowedUploadExtension("report.txt", "application/pdf")).toBe(false);
  });

  it("should handle empty and unexpected extension inputs safely", () => {
    expect(isAllowedUploadExtension("", "application/pdf")).toBe(false);
    expect(isAllowedUploadExtension("photo.jpg.exe", "image/jpeg")).toBe(false);
    expect(isAllowedUploadExtension("photo.JPG", "image/jpeg")).toBe(true);
  });
});

describe("record transition constants and reference helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose expected transition and document requirements for workflow statuses", () => {
    expect(ALLOWED_TRANSITIONS.Draft).toContain("PendingApproval");
    expect(REQUIRED_DOCUMENTS.TRANSFER.Completed).toEqual([["TransferChallan"]]);
    expect(APPROVAL_REQUIRED.DISPOSAL).toContain("Approved");
  });

  it("should derive office codes from explicit codes and office names", async () => {
    vi.mocked(OfficeModel.findById).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({ code: " do1 ", name: "District Office 1" }),
    } as never);

    await expect(getOfficeCode("office-1")).resolves.toBe("DO1");

    vi.mocked(OfficeModel.findById).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({ code: "", name: "District Lab North" }),
    } as never);

    await expect(getOfficeCode("office-2")).resolves.toBe("DLN");
  });

  it("should fall back to OFF when office lookup fails and should generate padded references", async () => {
    vi.mocked(OfficeModel.findById).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(getOfficeCode("missing-office")).resolves.toBe("OFF");

    vi.mocked(OfficeModel.findById).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({ code: "HQ", name: "Head Office" }),
    } as never);
    vi.mocked(CounterModel.findOneAndUpdate).mockResolvedValueOnce({ seq: 12 } as never);

    const reference = await generateReference("TRANSFER", "office-1");

    expect(reference).toMatch(/^TRF-HQ-\d{4}-000012$/);
    expect(vi.mocked(CounterModel.findOneAndUpdate)).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^HQ:TRANSFER:\d{4}$/),
      }),
      { $inc: { seq: 1 } },
      expect.objectContaining({ new: true, upsert: true, setDefaultsOnInsert: true })
    );
  });
});

describe("unit conversion helpers", () => {
  const lookup = buildUnitLookup([
    { code: "g", group: "mass", toBase: 1, aliases: ["gram"] },
    { code: "kg", group: "mass", toBase: 1000, aliases: ["kilogram"] },
    { code: "ml", group: "volume", toBase: 1, aliases: ["milliliter"] },
  ]);

  it("should normalize, format, and classify units for typical valid input", () => {
    expect(normalizeUom(" Gram ", lookup)).toBe("g");
    expect(formatUom("kilogram", lookup)).toBe("kg");
    expect(getUomType("kg", lookup)).toBe("mass");
    expect(isCompatibleUom("g", "kg", lookup)).toBe(true);
  });

  it("should convert quantities between compatible units and preserve zero values", () => {
    expect(convertToBaseQty(2, "kg", "g", lookup)).toBe(2000);
    expect(convertToBaseQty(0, "g", "g", lookup)).toBe(0);
  });

  it("should reject unknown units, missing configuration, and incompatible conversions", () => {
    expect(() => normalizeUom("ounce", lookup)).toThrowError(/unsupported unit/i);
    expect(() => normalizeUom("g", buildUnitLookup([]))).toThrowError(
      /no units configured/i
    );
    expect(() => convertToBaseQty(1, "kg", "ml", lookup)).toThrowError(
      /incompatible/i
    );
    expect(isCompatibleUom("kg", "unknown", lookup)).toBe(false);
  });
});

describe("consumable lab scope and permission helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve office capability fallbacks correctly", () => {
    expect(supportsChemicals({ type: "DISTRICT_LAB" })).toBe(true);
    expect(supportsChemicals({ capabilities: { chemicals: false }, type: "DISTRICT_LAB" })).toBe(false);
    expect(supportsConsumables({})).toBe(true);
    expect(supportsConsumables({ capabilities: { consumables: false } })).toBe(false);
    expect(supportsMoveables({ capabilities: { moveables: false } })).toBe(false);
    expect(supportsMoveables({})).toBe(true);
  });

  it("should resolve office types and category scopes from mocked model lookups", async () => {
    vi.mocked(OfficeModel.findById).mockReturnValueOnce(
      createQueryMock({ type: " district_lab " }) as never
    );
    vi.mocked(CategoryModel.findById)
      .mockReturnValueOnce(createQueryMock({ scope: "LAB_ONLY" }) as never)
      .mockReturnValueOnce(createQueryMock({ scope: "LAB_ONLY" }) as never);
    vi.mocked(ConsumableItemModel.findById).mockReturnValueOnce(
      createQueryMock({ category_id: "cat-1" }) as never
    );

    await expect(resolveOfficeTypeById("office-1")).resolves.toBe("DISTRICT_LAB");
    await expect(resolveConsumableCategoryScopeByCategoryId("cat-1")).resolves.toBe(
      "LAB_ONLY"
    );
    await expect(resolveConsumableCategoryScopeForItem("item-1")).resolves.toBe(
      "LAB_ONLY"
    );
    expect(officeTypeSupportsLabOnly("HEAD_OFFICE")).toBe(true);
    expect(officeSupportsLabOnly({ type: "DISTRICT_OFFICE" })).toBe(false);
  });

  it("should resolve lab-only ids and request scopes for non-lab offices", async () => {
    vi.mocked(CategoryModel.find).mockReturnValueOnce(
      createQueryMock([{ _id: "cat-1" }]) as never
    );
    vi.mocked(CategoryModel.find).mockReturnValueOnce(
      createQueryMock([{ _id: "cat-1" }]) as never
    );
    vi.mocked(ConsumableItemModel.find).mockReturnValueOnce(
      createQueryMock([{ _id: "item-1" }]) as never
    );

    expect(await resolveLabOnlyCategoryIds()).toEqual(["cat-1"]);
    expect(await resolveLabOnlyConsumableItemIds()).toEqual(["item-1"]);

    vi.mocked(OfficeModel.findById).mockReturnValueOnce(
      createQueryMock({ type: "DISTRICT_OFFICE" }) as never
    );

    const scope = await resolveConsumableRequestScope({
      user: {
        role: "employee",
        isOrgAdmin: false,
        locationId: "office-1",
      },
    } as never);

    expect(scope).toEqual({
      isGlobal: false,
      role: "employee",
      locationId: "office-1",
      canAccessLabOnly: false,
    });

    expect(() => ensureScopeOfficeAccess(scope, "office-2")).toThrowError(
      /forbidden/i
    );
  });

  it("should allow global scopes and return restricted ids only when lab-only access is denied", async () => {
    const globalScope = await resolveConsumableRequestScope({
      user: {
        role: "org_admin",
        isOrgAdmin: true,
        locationId: null,
      },
    } as never);

    expect(globalScope.canAccessLabOnly).toBe(true);
    expect(await resolveScopeLabOnlyRestrictions(globalScope)).toEqual({
      labOnlyCategoryIds: [],
      labOnlyItemIds: [],
    });

    const restrictedScope = {
      isGlobal: false,
      role: "employee",
      locationId: "office-1",
      canAccessLabOnly: false,
    };

    vi.mocked(CategoryModel.find)
      .mockReturnValueOnce(createQueryMock([{ _id: "cat-2" }]) as never)
      .mockReturnValueOnce(createQueryMock([{ _id: "cat-2" }]) as never);
    vi.mocked(ConsumableItemModel.find).mockReturnValueOnce(
      createQueryMock([{ _id: "item-2" }]) as never
    );

    expect(await resolveScopeLabOnlyRestrictions(restrictedScope)).toEqual({
      labOnlyCategoryIds: ["cat-2"],
      labOnlyItemIds: ["item-2"],
    });
  });

  it("should reject lab-only item/category access for non-lab scopes", async () => {
    const scope = {
      isGlobal: false,
      role: "employee",
      locationId: "office-1",
      canAccessLabOnly: false,
    };

    vi.mocked(CategoryModel.findById)
      .mockReturnValueOnce(createQueryMock({ scope: "LAB_ONLY" }) as never)
      .mockReturnValueOnce(createQueryMock({ scope: "LAB_ONLY" }) as never);

    vi.mocked(ConsumableItemModel.findById).mockReturnValueOnce(
      createQueryMock({ category_id: "cat-1" }) as never
    );

    await expect(ensureScopeItemAccess(scope, "item-1")).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      ensureScopeCategoryAccess(scope, "cat-1")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("should resolve consumable permissions for each important role", () => {
    expect(resolveConsumablePermissions("org_admin").canOverrideNegative).toBe(
      true
    );
    expect(resolveConsumablePermissions("caretaker").canManageItems).toBe(true);
    expect(resolveConsumablePermissions("office_head").canAdjust).toBe(true);
    expect(resolveConsumablePermissions("employee").canConsume).toBe(true);
    expect(resolveConsumablePermissions("employee").canAdjust).toBe(false);
    expect(resolveConsumablePermissions("compliance_auditor").canViewReports).toBe(
      true
    );
    expect(resolveConsumablePermissions("unknown")).toEqual(
      resolveConsumablePermissions(null)
    );
  });
});
