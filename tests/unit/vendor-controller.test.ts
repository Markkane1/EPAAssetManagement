import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestContextMock = vi.fn();
const vendorFindMock = vi.fn();
const vendorFindByIdMock = vi.fn();
const vendorCreateMock = vi.fn();
const vendorFindByIdAndUpdateMock = vi.fn();
const vendorFindByIdAndDeleteMock = vi.fn();
const officeExistsMock = vi.fn();

vi.mock("../../server/src/utils/scope", () => ({
  getRequestContext: (...args: unknown[]) => getRequestContextMock(...args),
}));

vi.mock("../../server/src/models/vendor.model", () => ({
  VendorModel: {
    find: (...args: unknown[]) => vendorFindMock(...args),
    findById: (...args: unknown[]) => vendorFindByIdMock(...args),
    create: (...args: unknown[]) => vendorCreateMock(...args),
    findByIdAndUpdate: (...args: unknown[]) => vendorFindByIdAndUpdateMock(...args),
    findByIdAndDelete: (...args: unknown[]) => vendorFindByIdAndDeleteMock(...args),
  },
}));

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    exists: (...args: unknown[]) => officeExistsMock(...args),
  },
}));

import { vendorController } from "../../server/src/controllers/vendor.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("vendorController", () => {
  const officeId = "507f1f77bcf86cd799439011";
  const otherOfficeId = "507f1f77bcf86cd799439012";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list vendors within office scope and reject invalid org-admin office filters", async () => {
    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: true, locationId: null, role: "org_admin" });
    const invalidNext = vi.fn();
    await vendorController.list(
      { query: { officeId: "bad-id" } } as never,
      createResponse() as never,
      invalidNext
    );
    expect(invalidNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));

    const leanMock = vi.fn().mockResolvedValue([{ id: "vendor-1" }]);
    vendorFindMock.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: leanMock }) }) }),
    });
    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: false, locationId: officeId, role: "office_head" });

    const res = createResponse();
    await vendorController.list(
      { query: { search: "lab" } } as never,
      res as never,
      vi.fn()
    );

    expect(vendorFindMock).toHaveBeenCalledWith(
      expect.objectContaining({ office_id: officeId }),
      expect.any(Object)
    );
    expect(res.json).toHaveBeenCalledWith([{ id: "vendor-1" }]);
  });

  it("should enforce vendor read scope for getById", async () => {
    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: false, locationId: officeId, role: "office_head" });
    vendorFindByIdMock.mockReturnValueOnce({ lean: async () => null });
    const notFoundRes = createResponse();
    await vendorController.getById({ params: { id: "vendor-1" } } as never, notFoundRes as never, vi.fn());
    expect(notFoundRes.status).toHaveBeenCalledWith(404);

    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: false, locationId: officeId, role: "office_head" });
    vendorFindByIdMock.mockReturnValueOnce({ lean: async () => ({ office_id: otherOfficeId }) });
    const forbiddenNext = vi.fn();
    await vendorController.getById({ params: { id: "vendor-1" } } as never, createResponse() as never, forbiddenNext);
    expect(forbiddenNext).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it("should create vendors with normalized payloads and office validation", async () => {
    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: false, locationId: officeId, role: "employee" });
    const forbiddenNext = vi.fn();
    await vendorController.create({ body: {} } as never, createResponse() as never, forbiddenNext);
    expect(forbiddenNext).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));

    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: false, locationId: officeId, role: "office_head" });
    officeExistsMock.mockResolvedValueOnce(true);
    vendorCreateMock.mockResolvedValueOnce({ id: "vendor-1" });
    const res = createResponse();
    await vendorController.create(
      {
        body: {
          name: "Vendor",
          contactInfo: "Sarah Khan",
          email: "vendor@test.com",
          phone: "12345",
          address: "Science Road",
          officeId,
        },
      } as never,
      res as never,
      vi.fn()
    );
    expect(vendorCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Vendor",
        contact_info: "Sarah Khan",
        email: "vendor@test.com",
        phone: "12345",
        address: "Science Road",
        office_id: officeId,
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("should update vendors with office re-assignment rules", async () => {
    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: false, locationId: "office-1", role: "office_head" });
    vendorFindByIdMock.mockResolvedValueOnce(null);
    const notFoundRes = createResponse();
    await vendorController.update({ params: { id: "vendor-1" }, body: {} } as never, notFoundRes as never, vi.fn());
    expect(notFoundRes.status).toHaveBeenCalledWith(404);

    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: true, locationId: null, role: "org_admin" });
    vendorFindByIdMock.mockResolvedValueOnce({ office_id: officeId });
    officeExistsMock.mockResolvedValueOnce(true);
    vendorFindByIdAndUpdateMock.mockResolvedValueOnce({ id: "vendor-1", office_id: otherOfficeId });
    const updateRes = createResponse();
    await vendorController.update(
      {
        params: { id: "vendor-1" },
        body: { officeId: "507f1f77bcf86cd799439011", contactInfo: "Updated Contact" },
      } as never,
      updateRes as never,
      vi.fn()
    );
    expect(vendorFindByIdAndUpdateMock).toHaveBeenCalledWith(
      "vendor-1",
      expect.objectContaining({ contact_info: "Updated Contact" }),
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(updateRes.json).toHaveBeenCalledWith({ id: "vendor-1", office_id: otherOfficeId });
  });

  it("should remove vendors within scope", async () => {
    getRequestContextMock.mockResolvedValueOnce({ isOrgAdmin: false, locationId: officeId, role: "office_head" });
    vendorFindByIdMock.mockReturnValueOnce({ lean: async () => ({ office_id: officeId }) });
    vendorFindByIdAndDeleteMock.mockResolvedValueOnce({ id: "vendor-1" });

    const res = createResponse();
    await vendorController.remove({ params: { id: "vendor-1" } } as never, res as never, vi.fn());

    expect(vendorFindByIdAndDeleteMock).toHaveBeenCalledWith("vendor-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
