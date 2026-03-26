import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationExistsMock = vi.fn();
const notificationFindMock = vi.fn();
const notificationCreateMock = vi.fn();
const notificationInsertManyMock = vi.fn();
const userFindMock = vi.fn();
const userExistsMock = vi.fn();
const settingsFindOneMock = vi.fn();
const buildUserRoleMatchFilterMock = vi.fn((roles: string[]) => ({ roles }));

vi.mock("../../server/src/models/notification.model", () => ({
  NotificationModel: {
    exists: (...args: unknown[]) => notificationExistsMock(...args),
    find: (...args: unknown[]) => notificationFindMock(...args),
    create: (...args: unknown[]) => notificationCreateMock(...args),
    insertMany: (...args: unknown[]) => notificationInsertManyMock(...args),
  },
}));

vi.mock("../../server/src/models/user.model", () => ({
  UserModel: {
    find: (...args: unknown[]) => userFindMock(...args),
    exists: (...args: unknown[]) => userExistsMock(...args),
  },
}));

vi.mock("../../server/src/models/systemSettings.model", () => ({
  SystemSettingsModel: {
    findOne: (...args: unknown[]) => settingsFindOneMock(...args),
  },
}));

vi.mock("../../server/src/utils/roles", () => ({
  buildUserRoleMatchFilter: (...args: unknown[]) => buildUserRoleMatchFilterMock(...args),
}));

import {
  createBulkNotifications,
  createNotification,
  invalidateNotificationSettingsCache,
  resolveNotificationRecipientsByOffice,
} from "../../server/src/services/notification.service";

function execQuery<T>(value: T) {
  return {
    lean: () => ({ exec: async () => value }),
  };
}

describe("notification.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateNotificationSettingsCache();
    settingsFindOneMock.mockReturnValue(execQuery({ notifications: {} }));
    userExistsMock.mockResolvedValue(true);
    notificationExistsMock.mockResolvedValue(false);
    notificationFindMock.mockReturnValue(execQuery([]));
    notificationCreateMock.mockResolvedValue({ id: "notification-1" });
    notificationInsertManyMock.mockResolvedValue([{ id: "bulk-1" }]);
    userFindMock.mockReturnValue(execQuery([{ _id: "507f1f77bcf86cd799439011" }]));
  });

  it("should resolve office recipients with org admins, explicit users, and exclusions applied", async () => {
    userFindMock.mockReturnValue(
      execQuery([
        {
          _id: "507f1f77bcf86cd799439011",
          location_id: "507f1f77bcf86cd799439021",
          role: "office_head",
          roles: ["office_head"],
        },
        {
          _id: "507f1f77bcf86cd799439012",
          role: "org_admin",
          roles: ["org_admin"],
        },
        {
          _id: "507f1f77bcf86cd799439013",
          role: "employee",
          roles: ["employee"],
        },
      ])
    );

    const recipients = await resolveNotificationRecipientsByOffice({
      officeIds: ["507f1f77bcf86cd799439021", "507f1f77bcf86cd799439021"],
      includeOrgAdmins: true,
      includeRoles: ["office_head", "caretaker"],
      includeUserIds: ["507f1f77bcf86cd799439013"],
      excludeUserIds: ["507f1f77bcf86cd799439012"],
    });

    expect(buildUserRoleMatchFilterMock).toHaveBeenCalledWith(["office_head", "caretaker"]);
    expect(buildUserRoleMatchFilterMock).toHaveBeenCalledWith(["org_admin"]);
    expect(userFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: true,
        $or: expect.arrayContaining([
          expect.objectContaining({ location_id: { $in: ["507f1f77bcf86cd799439021"] } }),
          expect.objectContaining({ roles: ["org_admin"] }),
          expect.objectContaining({ _id: { $in: ["507f1f77bcf86cd799439013"] } }),
        ]),
      }),
      { _id: 1, location_id: 1, role: 1, roles: 1 }
    );
    expect(recipients).toEqual([
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439013",
    ]);
  });

  it("should skip notification creation when the type is disabled or the recipient is invalid", async () => {
    settingsFindOneMock.mockReturnValue(
      execQuery({ notifications: { assignment_notifications: false } })
    );

    await expect(
      createNotification({
        recipientUserId: "bad-id",
        officeId: "507f1f77bcf86cd799439021",
        type: "TRANSFER_REQUESTED",
        title: "Transfer",
        message: "Transfer requested",
        entityType: "Transfer",
        entityId: "507f1f77bcf86cd799439031",
      })
    ).resolves.toBeNull();

    await expect(
      createNotification({
        recipientUserId: "507f1f77bcf86cd799439011",
        officeId: "507f1f77bcf86cd799439021",
        type: "TRANSFER_REQUESTED",
        title: "Transfer",
        message: "Transfer requested",
        entityType: "Transfer",
        entityId: "507f1f77bcf86cd799439031",
      })
    ).resolves.toBeNull();

    expect(notificationCreateMock).not.toHaveBeenCalled();
  });

  it("should create a notification after validating recipients and dedupe rules", async () => {
    const created = await createNotification({
      recipientUserId: "507f1f77bcf86cd799439011",
      officeId: "507f1f77bcf86cd799439021",
      type: "TRANSFER_REQUESTED",
      title: "Transfer",
      message: "Transfer requested",
      entityType: "Transfer",
      entityId: "507f1f77bcf86cd799439031",
      dedupeWindowHours: 12,
    });

    expect(userExistsMock).toHaveBeenCalledWith({ _id: "507f1f77bcf86cd799439011" });
    expect(notificationExistsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_user_id: "507f1f77bcf86cd799439011",
        office_id: "507f1f77bcf86cd799439021",
        type: "TRANSFER_REQUESTED",
        entity_type: "Transfer",
        entity_id: "507f1f77bcf86cd799439031",
      })
    );
    expect(notificationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_user_id: "507f1f77bcf86cd799439011",
        office_id: "507f1f77bcf86cd799439021",
        type: "TRANSFER_REQUESTED",
        title: "Transfer",
        message: "Transfer requested",
        entity_type: "Transfer",
        entity_id: "507f1f77bcf86cd799439031",
      })
    );
    expect(created).toEqual({ id: "notification-1" });
  });

  it("should bulk-create only valid, enabled, non-duplicate notifications for existing recipients", async () => {
    settingsFindOneMock.mockReturnValue(
      execQuery({ notifications: { maintenance_reminders: false } })
    );
    notificationFindMock.mockReturnValue(
      execQuery([
        {
          recipient_user_id: "507f1f77bcf86cd799439013",
          office_id: "507f1f77bcf86cd799439021",
          type: "TRANSFER_APPROVED",
          entity_type: "Transfer",
          entity_id: "507f1f77bcf86cd799439032",
          created_at: new Date().toISOString(),
        },
      ])
    );
    userFindMock.mockReturnValue(
      execQuery([
        { _id: "507f1f77bcf86cd799439011" },
        { _id: "507f1f77bcf86cd799439013" },
      ])
    );

    const rows = await createBulkNotifications([
      {
        recipientUserId: "507f1f77bcf86cd799439011",
        officeId: "507f1f77bcf86cd799439021",
        type: "TRANSFER_REQUESTED",
        title: "Transfer",
        message: "Transfer requested",
        entityType: "Transfer",
        entityId: "507f1f77bcf86cd799439031",
      },
      {
        recipientUserId: "507f1f77bcf86cd799439012",
        officeId: "507f1f77bcf86cd799439021",
        type: "MAINTENANCE_DUE",
        title: "Maintenance",
        message: "Due",
        entityType: "AssetItem",
        entityId: "507f1f77bcf86cd799439041",
      },
      {
        recipientUserId: "507f1f77bcf86cd799439013",
        officeId: "507f1f77bcf86cd799439021",
        type: "TRANSFER_APPROVED",
        title: "Approved",
        message: "Approved",
        entityType: "Transfer",
        entityId: "507f1f77bcf86cd799439032",
        dedupeWindowHours: 24,
      },
      {
        recipientUserId: "invalid",
        officeId: "507f1f77bcf86cd799439021",
        type: "TRANSFER_REQUESTED",
        title: "Bad",
        message: "Bad",
        entityType: "Transfer",
        entityId: "507f1f77bcf86cd799439033",
      },
    ]);

    expect(notificationInsertManyMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          recipient_user_id: "507f1f77bcf86cd799439011",
          type: "TRANSFER_REQUESTED",
        }),
      ],
      { ordered: false }
    );
    expect(rows).toEqual([{ id: "bulk-1" }]);
  });
});
