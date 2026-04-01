import { beforeEach, describe, expect, it, vi } from "vitest";

const officeFindMock = vi.fn();
const officeFindByIdMock = vi.fn();
const officeCreateMock = vi.fn();
const officeFindByIdAndUpdateMock = vi.fn();
const officeFindByIdAndDeleteMock = vi.fn();
const officeExistsMock = vi.fn();
const officeFindOneMock = vi.fn();

vi.mock("../../server/src/models/office.model", () => ({
  OfficeModel: {
    find: (...args: unknown[]) => officeFindMock(...args),
    findById: (...args: unknown[]) => officeFindByIdMock(...args),
    create: (...args: unknown[]) => officeCreateMock(...args),
    findByIdAndUpdate: (...args: unknown[]) => officeFindByIdAndUpdateMock(...args),
    findByIdAndDelete: (...args: unknown[]) => officeFindByIdAndDeleteMock(...args),
    exists: (...args: unknown[]) => officeExistsMock(...args),
    findOne: (...args: unknown[]) => officeFindOneMock(...args),
  },
}));

vi.mock("../../server/src/services/officeReferenceSync.service", () => ({
  syncOfficeReferenceData: vi.fn().mockResolvedValue(undefined),
}));

import { officeController } from "../../server/src/controllers/office.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("officeController", () => {
  const officeId = "507f1f77bcf86cd799439011";
  const parentOfficeId = "507f1f77bcf86cd799439012";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list offices with search and capability filters", async () => {
    const leanMock = vi.fn().mockResolvedValue([{ id: officeId }]);
    officeFindMock.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ lean: leanMock }) }) }),
    });

    const res = createResponse();
    await officeController.list(
      { query: { search: "central", type: "DISTRICT_LAB", capability: "chemicals", isActive: "true" } } as never,
      res as never,
      vi.fn()
    );

    expect(officeFindMock).toHaveBeenCalledWith(expect.objectContaining({ $and: expect.any(Array) }), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith([{ id: officeId }]);
  });

  it("should return 404 for missing offices on getById and delete", async () => {
    officeFindByIdMock.mockReturnValueOnce({ lean: async () => null });
    const getRes = createResponse();
    await officeController.getById({ params: { id: officeId } } as never, getRes as never, vi.fn());
    expect(getRes.status).toHaveBeenCalledWith(404);

    officeFindByIdAndDeleteMock.mockResolvedValueOnce(null);
    const deleteRes = createResponse();
    await officeController.remove({ params: { id: officeId } } as never, deleteRes as never, vi.fn());
    expect(deleteRes.status).toHaveBeenCalledWith(404);
  });

  it("should validate create payloads and head office uniqueness", async () => {
    const invalidRes = createResponse();
    await officeController.create(
      { body: { name: "", division: "Punjab", district: "Lahore", address: "Addr", contactNumber: "123", type: "HEAD_OFFICE" } } as never,
      invalidRes as never,
      vi.fn()
    );
    expect(invalidRes.status).toHaveBeenCalledWith(400);

    officeExistsMock.mockResolvedValueOnce(true);
    const headOfficeConflictRes = createResponse();
    await officeController.create(
      {
        body: {
          name: "Head Office",
          division: "Punjab",
          district: "Lahore",
          address: "Addr",
          contactNumber: "+923001234567",
          type: "HEAD_OFFICE",
          isActive: true,
        },
      } as never,
      headOfficeConflictRes as never,
      vi.fn()
    );
    expect(headOfficeConflictRes.status).toHaveBeenCalledWith(409);
  });

  it("should create a district lab and force chemical capability", async () => {
    officeExistsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    officeCreateMock.mockResolvedValueOnce({ toJSON: () => ({ id: officeId, capabilities: { chemicals: true } }) });

    const res = createResponse();
    await officeController.create(
      {
        body: {
          name: "District Lab",
          division: "Punjab",
          district: "Kasur",
          address: "Addr",
          contactNumber: "+923001234567",
          type: "DISTRICT_LAB",
          capabilities: { consumables: true, chemicals: false },
        },
      } as never,
      res as never,
      vi.fn()
    );

    expect(officeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "District Lab",
        type: "DISTRICT_LAB",
        contact_number: "+923001234567",
        capabilities: { consumables: true, chemicals: true },
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("should validate update hierarchy and merge non-lab capabilities safely", async () => {
    officeFindByIdMock.mockResolvedValueOnce({
      type: "DIRECTORATE",
      district: "Lahore",
      is_active: true,
      parent_office_id: parentOfficeId,
      capabilities: { consumables: true, chemicals: true },
    });
    const invalidRes = createResponse();
    await officeController.update(
      { params: { id: officeId }, body: { type: "HEAD_OFFICE", parentOfficeId } } as never,
      invalidRes as never,
      vi.fn()
    );
    expect(invalidRes.status).toHaveBeenCalledWith(400);

    officeFindByIdMock.mockResolvedValueOnce({
      type: "DIRECTORATE",
      district: "Lahore",
      is_active: true,
      parent_office_id: parentOfficeId,
      capabilities: { consumables: true, chemicals: true },
    });
    officeFindOneMock.mockReturnValueOnce({ lean: async () => ({ _id: parentOfficeId }) });
    officeExistsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    officeFindByIdAndUpdateMock.mockResolvedValueOnce({ toJSON: () => ({ id: officeId }) });

    const res = createResponse();
    await officeController.update(
      {
        params: { id: officeId },
        body: { type: "DIRECTORATE", parentOfficeId, capabilities: { consumables: false } },
      } as never,
      res as never,
      vi.fn()
    );

    expect(officeFindByIdAndUpdateMock).toHaveBeenCalledWith(
      officeId,
      expect.objectContaining({ capabilities: { consumables: false, chemicals: false } }),
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith({ id: officeId });
  });

  it("should delete existing offices", async () => {
    officeFindByIdAndDeleteMock.mockResolvedValueOnce({ id: officeId });
    const res = createResponse();

    await officeController.remove({ params: { id: officeId } } as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(204);
  });
});
