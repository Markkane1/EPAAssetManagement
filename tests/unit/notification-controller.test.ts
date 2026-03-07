import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationFindMock = vi.fn();
const notificationCountMock = vi.fn();
const notificationFindOneAndUpdateMock = vi.fn();
const notificationUpdateManyMock = vi.fn();
const notificationFindOneMock = vi.fn();
const approvalFindMock = vi.fn();
const approvalFindOneMock = vi.fn();
const getRequestContextMock = vi.fn();
const decideApprovalMock = vi.fn();

vi.mock("../../server/src/models/notification.model", () => ({
  NotificationModel: {
    find: (...args: unknown[]) => notificationFindMock(...args),
    countDocuments: (...args: unknown[]) => notificationCountMock(...args),
    findOneAndUpdate: (...args: unknown[]) => notificationFindOneAndUpdateMock(...args),
    updateMany: (...args: unknown[]) => notificationUpdateManyMock(...args),
    findOne: (...args: unknown[]) => notificationFindOneMock(...args),
  },
}));

vi.mock("../../server/src/models/approvalRequest.model", () => ({
  ApprovalRequestModel: {
    find: (...args: unknown[]) => approvalFindMock(...args),
    findOne: (...args: unknown[]) => approvalFindOneMock(...args),
  },
}));

vi.mock("../../server/src/utils/scope", () => ({
  getRequestContext: (...args: unknown[]) => getRequestContextMock(...args),
}));

vi.mock("../../server/src/modules/records/services/approval.service", () => ({
  decideApproval: (...args: unknown[]) => decideApprovalMock(...args),
}));

import { notificationController } from "../../server/src/controllers/notification.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("notificationController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject unauthorized notification listing and invalid unreadOnly values", async () => {
    const next = vi.fn();

    await notificationController.list({ user: undefined, query: {} } as never, createResponse() as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));

    const invalidNext = vi.fn();
    await notificationController.list(
      { user: { userId: "user-1" }, query: { unreadOnly: "maybe" } } as never,
      createResponse() as never,
      invalidNext
    );
    expect(invalidNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it("should list notifications with actionable metadata and pagination", async () => {
    notificationFindMock.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: "507f1f77bcf86cd799439011",
                type: "APPROVAL_REQUESTED",
                entity_type: "Record",
                entity_id: "507f1f77bcf86cd799439012",
                recipient_user_id: "user-1",
              },
              {
                _id: "507f1f77bcf86cd799439013",
                type: "INFO",
                entity_type: "Transfer",
                entity_id: "transfer-1",
                recipient_user_id: "user-1",
                acknowledged_at: new Date(),
              },
            ],
          }),
        }),
      }),
    });
    notificationCountMock.mockResolvedValue(2);
    approvalFindMock.mockReturnValue({
      lean: () => ({ exec: async () => [{ record_id: "507f1f77bcf86cd799439012" }] }),
    });

    const res = createResponse();
    await notificationController.list(
      { user: { userId: "user-1" }, query: { unreadOnly: "true", limit: "500", page: "2" } } as never,
      res as never,
      vi.fn()
    );

    expect(notificationFindMock).toHaveBeenCalledWith({ recipient_user_id: "user-1", is_read: false });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 100,
        total: 2,
        data: expect.arrayContaining([
          expect.objectContaining({
            open_path: "/compliance",
            available_actions: expect.arrayContaining(["APPROVE", "REJECT", "OPEN_RECORD", "ACKNOWLEDGE"]),
          }),
          expect.objectContaining({
            open_path: "/transfers/transfer-1",
            available_actions: ["OPEN_RECORD"],
          }),
        ]),
      })
    );
  });

  it("should validate markRead requests and return 404 when the notification is missing", async () => {
    const invalidNext = vi.fn();
    await notificationController.markRead(
      { user: { userId: "user-1" }, params: { id: "bad-id" } } as never,
      createResponse() as never,
      invalidNext
    );
    expect(invalidNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));

    notificationFindOneAndUpdateMock.mockReturnValue({ lean: async () => null });
    const missingNext = vi.fn();
    await notificationController.markRead(
      { user: { userId: "user-1" }, params: { id: "507f1f77bcf86cd799439011" } } as never,
      createResponse() as never,
      missingNext
    );
    expect(missingNext).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("should mark all notifications as read for the recipient", async () => {
    notificationUpdateManyMock.mockResolvedValue({ matchedCount: 3, modifiedCount: 2 });
    const res = createResponse();

    await notificationController.markAllRead({ user: { userId: "user-1" } } as never, res as never, vi.fn());

    expect(notificationUpdateManyMock).toHaveBeenCalledWith(
      { recipient_user_id: "user-1", is_read: false },
      { $set: { is_read: true } }
    );
    expect(res.json).toHaveBeenCalledWith({ matched: 3, modified: 2 });
  });

  it("should acknowledge a notification and return its open path", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    notificationFindOneMock.mockResolvedValue({
      type: "INFO",
      entity_type: "ReturnRequest",
      entity_id: "return-1",
      save: saveMock,
    });

    const res = createResponse();
    await notificationController.action(
      {
        user: { userId: "user-1" },
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "ACKNOWLEDGE" },
      } as never,
      res as never,
      vi.fn()
    );

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ACKNOWLEDGE", openPath: "/returns/return-1" })
    );
  });

  it("should reject unsupported approval actions and execute valid approval decisions", async () => {
    notificationFindOneMock.mockResolvedValueOnce({
      type: "INFO",
      entity_type: "Transfer",
      entity_id: "transfer-1",
      save: vi.fn(),
    });
    const invalidNext = vi.fn();
    await notificationController.action(
      {
        user: { userId: "user-1" },
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "APPROVE" },
      } as never,
      createResponse() as never,
      invalidNext
    );
    expect(invalidNext).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));

    const saveMock = vi.fn().mockResolvedValue(undefined);
    notificationFindOneMock.mockResolvedValueOnce({
      type: "APPROVAL_REQUESTED",
      entity_type: "Record",
      entity_id: "507f1f77bcf86cd799439012",
      save: saveMock,
    });
    approvalFindOneMock.mockReturnValue({
      sort: () => ({ exec: async () => ({ _id: "approval-1" }) }),
    });
    getRequestContextMock.mockResolvedValue({ userId: "user-1", role: "office_head", locationId: "office-1", isOrgAdmin: false });
    decideApprovalMock.mockResolvedValue({ status: "Approved" });

    const res = createResponse();
    await notificationController.action(
      {
        user: { userId: "user-1" },
        params: { id: "507f1f77bcf86cd799439011" },
        body: { action: "APPROVE", decisionNotes: "Looks fine" },
      } as never,
      res as never,
      vi.fn()
    );

    expect(decideApprovalMock).toHaveBeenCalledWith(
      expect.anything(),
      "approval-1",
      { decision: "Approved", decisionNotes: "Looks fine" }
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ action: "APPROVE", approval: { status: "Approved" } })
    );
  });
});
