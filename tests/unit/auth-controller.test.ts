import { beforeEach, describe, expect, it, vi } from "vitest";

const hashMock = vi.fn();
const compareMock = vi.fn();
const jwtSignMock = vi.fn();
const randomBytesMock = vi.fn();
const createHashMock = vi.fn();
const userFindOneMock = vi.fn();
const userCreateMock = vi.fn();
const userFindByIdMock = vi.fn();
const userFindMock = vi.fn();
const userUpdateOneMock = vi.fn();
const employeeFindOneMock = vi.fn();
const employeeFindMock = vi.fn();
const activityInsertManyMock = vi.fn();

vi.mock("bcryptjs", () => ({
  default: {
    hash: (...args: unknown[]) => hashMock(...args),
    compare: (...args: unknown[]) => compareMock(...args),
  },
  hash: (...args: unknown[]) => hashMock(...args),
  compare: (...args: unknown[]) => compareMock(...args),
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: (...args: unknown[]) => jwtSignMock(...args),
  },
  sign: (...args: unknown[]) => jwtSignMock(...args),
}));

vi.mock("crypto", () => ({
  default: {
    randomBytes: (...args: unknown[]) => randomBytesMock(...args),
    createHash: (...args: unknown[]) => createHashMock(...args),
  },
  randomBytes: (...args: unknown[]) => randomBytesMock(...args),
  createHash: (...args: unknown[]) => createHashMock(...args),
}));

vi.mock("../../server/src/config/env", () => ({
  env: {
    jwtSecret: "test-secret",
    jwtExpiresIn: "1h",
    nodeEnv: "test",
    authLockoutThreshold: 5,
    authLockoutBaseMinutes: 15,
    authLockoutMaxMinutes: 60,
    passwordResetTokenTtlMinutes: 30,
  },
}));

vi.mock("../../server/src/models/user.model", () => ({
  UserModel: {
    findOne: (...args: unknown[]) => userFindOneMock(...args),
    create: (...args: unknown[]) => userCreateMock(...args),
    findById: (...args: unknown[]) => userFindByIdMock(...args),
    find: (...args: unknown[]) => userFindMock(...args),
    updateOne: (...args: unknown[]) => userUpdateOneMock(...args),
  },
}));

vi.mock("../../server/src/models/employee.model", () => ({
  EmployeeModel: {
    findOne: (...args: unknown[]) => employeeFindOneMock(...args),
    find: (...args: unknown[]) => employeeFindMock(...args),
  },
}));

vi.mock("../../server/src/models/activityLog.model", () => ({
  ActivityLogModel: {
    insertMany: (...args: unknown[]) => activityInsertManyMock(...args),
  },
}));

import { authController } from "../../server/src/controllers/auth.controller";

function createResponse() {
  const res: Record<string, any> = {};
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("authController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashMock.mockResolvedValue("hashed-password");
    compareMock.mockResolvedValue(true);
    jwtSignMock.mockReturnValue("signed.jwt.token");
    randomBytesMock.mockImplementation((size: number) => Buffer.from("a".repeat(size)));
    createHashMock.mockImplementation(() => {
      let value = "";
      return {
        update(input: string) {
          value += String(input);
          return this;
        },
        digest() {
          return `hashed:${value}`;
        },
      };
    });
    userFindMock.mockResolvedValue([]);
    employeeFindOneMock.mockResolvedValue(null);
    employeeFindMock.mockResolvedValue([]);
    activityInsertManyMock.mockResolvedValue([]);
    userUpdateOneMock.mockResolvedValue({ modifiedCount: 1 });
  });

  it("should reject registration requests from non-admin callers", async () => {
    const req = { user: null, body: { email: "new.user@example.com", password: "StrongPass123!" } };
    const res = createResponse();
    const next = vi.fn();

    await authController.register(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Self-registration is disabled" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when registration is missing email or password and when password is too short", async () => {
    const res = createResponse();

    await authController.register(
      { user: { role: "org_admin", isOrgAdmin: true }, body: { email: "", password: "" } } as never,
      res as never,
      vi.fn()
    );
    expect(res.status).toHaveBeenCalledWith(400);

    const shortRes = createResponse();
    await authController.register(
      { user: { role: "org_admin", isOrgAdmin: true }, body: { email: "user@example.com", password: "short" } } as never,
      shortRes as never,
      vi.fn()
    );
    expect(shortRes.status).toHaveBeenCalledWith(400);
  });

  it("should reject duplicate registration emails and org-admin role escalation by non-org admins", async () => {
    userFindOneMock.mockResolvedValueOnce({ id: "existing-user" });

    const duplicateRes = createResponse();
    await authController.register(
      {
        user: { role: "org_admin", isOrgAdmin: true },
        body: { email: "existing@example.com", password: "StrongPass123!", role: "employee" },
      } as never,
      duplicateRes as never,
      vi.fn()
    );

    expect(duplicateRes.status).toHaveBeenCalledWith(409);

    userFindOneMock.mockResolvedValueOnce(null);
    const forbiddenRes = createResponse();
    await authController.register(
      {
        user: { role: "office_head", isOrgAdmin: false },
        body: { email: "admin@example.com", password: "StrongPass123!", roles: ["org_admin"] },
      } as never,
      forbiddenRes as never,
      vi.fn()
    );

    expect(forbiddenRes.status).toHaveBeenCalledWith(403);
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("should create a normalized user on successful registration", async () => {
    userFindOneMock.mockResolvedValue(null);
    userCreateMock.mockResolvedValue({
      id: "user-10",
      email: "new@example.com",
      first_name: "New",
      last_name: "User",
    });

    const req = {
      user: { role: "org_admin", isOrgAdmin: true },
      body: {
        email: "NEW@example.com",
        password: "StrongPass123!",
        firstName: "New",
        lastName: "User",
        role: "office_head",
        roles: ["office_head", "procurement_officer"],
        activeRole: "procurement_officer",
        locationId: "office-1",
      },
    };
    const res = createResponse();

    await authController.register(req as never, res as never, vi.fn());

    expect(hashMock).toHaveBeenCalledWith("StrongPass123!", 10);
    expect(userCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        role: "procurement_officer",
        active_role: "procurement_officer",
        roles: ["office_head", "procurement_officer"],
        location_id: "office-1",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      user: {
        id: "user-10",
        email: "new@example.com",
        firstName: "New",
        lastName: "User",
        role: "procurement_officer",
        activeRole: "procurement_officer",
        roles: ["office_head", "procurement_officer"],
      },
    });
  });

  it("should reject login payloads that do not contain string credentials and empty credentials", async () => {
    const nonStringRes = createResponse();
    await authController.login({ body: { email: { $gt: "" }, password: ["bad"] } } as never, nonStringRes as never, vi.fn());
    expect(nonStringRes.status).toHaveBeenCalledWith(401);

    const emptyRes = createResponse();
    await authController.login({ body: { email: "", password: "" } } as never, emptyRes as never, vi.fn());
    expect(emptyRes.status).toHaveBeenCalledWith(400);
  });

  it("should reject disabled, missing, locked, and invalid-password login attempts", async () => {
    userFindOneMock.mockResolvedValueOnce(null);
    const missingRes = createResponse();
    await authController.login({ body: { email: "nobody@example.com", password: "Admin123!" } } as never, missingRes as never, vi.fn());
    expect(missingRes.status).toHaveBeenCalledWith(401);

    userFindOneMock.mockResolvedValueOnce({ is_active: false });
    const disabledRes = createResponse();
    await authController.login({ body: { email: "disabled@example.com", password: "Admin123!" } } as never, disabledRes as never, vi.fn());
    expect(disabledRes.status).toHaveBeenCalledWith(403);

    userFindOneMock.mockResolvedValueOnce({
      is_active: true,
      lockout_until: new Date(Date.now() + 60_000).toISOString(),
    });
    const lockedRes = createResponse();
    await authController.login({ body: { email: "locked@example.com", password: "Admin123!" } } as never, lockedRes as never, vi.fn());
    expect(lockedRes.status).toHaveBeenCalledWith(429);

    const saveMock = vi.fn().mockResolvedValue(undefined);
    compareMock.mockResolvedValueOnce(false);
    userFindOneMock.mockResolvedValueOnce({
      email: "user@example.com",
      password_hash: "stored-hash",
      is_active: true,
      failed_login_attempts: 4,
      lockout_until: null,
      save: saveMock,
    });
    const invalidRes = createResponse();
    await authController.login({ body: { email: "user@example.com", password: "wrong" } } as never, invalidRes as never, vi.fn());
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(invalidRes.status).toHaveBeenCalledWith(429);
  });

  it("should issue session cookies and return the normalized user payload on successful login", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    userFindOneMock.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      first_name: "Admin",
      last_name: "User",
      role: "employee",
      roles: ["employee", "office_head"],
      active_role: "office_head",
      location_id: { toString: () => "office-1" },
      token_version: 3,
      password_hash: "stored-hash",
      failed_login_attempts: 2,
      lockout_until: null,
      is_active: true,
      save: saveMock,
    });

    const req = { body: { email: "admin@example.com", password: "Admin123!" } };
    const res = createResponse();

    await authController.login(req as never, res as never, vi.fn());

    expect(compareMock).toHaveBeenCalledWith("Admin123!", "stored-hash");
    expect(jwtSignMock).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({
      token: undefined,
      user: {
        id: "user-1",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        role: "office_head",
        activeRole: "office_head",
        roles: ["employee", "office_head"],
      },
    });
  });

  it("should handle me for unauthorized, missing users, and successful reads", async () => {
    const unauthorizedRes = createResponse();
    await authController.me({ user: undefined } as never, unauthorizedRes as never, vi.fn());
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    userFindByIdMock.mockResolvedValue(null);
    const notFoundRes = createResponse();
    await authController.me({ user: { userId: "missing" } } as never, notFoundRes as never, vi.fn());
    expect(notFoundRes.status).toHaveBeenCalledWith(404);

    userFindByIdMock.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      first_name: "Admin",
      last_name: "User",
      role: "office_head",
      roles: ["employee", "office_head"],
      active_role: "office_head",
      location_id: "office-1",
    });
    const meRes = createResponse();
    await authController.me({ user: { userId: "user-1" }, cookies: {} } as never, meRes as never, vi.fn());
    expect(meRes.cookie).toHaveBeenCalled();
    expect(meRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        role: "office_head",
        activeRole: "office_head",
        roles: ["employee", "office_head"],
      })
    );
  });

  it("should create password reset audit entries and include the token in test mode", async () => {
    const requesterSaveMock = vi.fn().mockResolvedValue(undefined);
    const requester = {
      id: "user-1",
      email: "employee@example.com",
      is_active: true,
      location_id: { toString: () => "office-1" },
      save: requesterSaveMock,
    };
    userFindOneMock.mockResolvedValueOnce(requester);
    employeeFindOneMock.mockResolvedValueOnce({ id: "emp-1", user_id: "user-1", location_id: "office-1", directorate_id: "dir-1" });
    userFindMock
      .mockResolvedValueOnce([{ id: "admin-global", location_id: null }])
      .mockResolvedValueOnce([{ id: "head-office", location_id: { toString: () => "office-1" } }])
      .mockResolvedValueOnce([{ id: "head-dir", location_id: { toString: () => "office-1" } }]);
    employeeFindMock.mockResolvedValueOnce([{ user_id: "head-dir" }]);

    const res = createResponse();
    await authController.requestPasswordReset(
      { body: { email: "employee@example.com" }, ip: "127.0.0.1", headers: { "user-agent": "vitest" } } as never,
      res as never,
      vi.fn()
    );

    expect(requesterSaveMock).toHaveBeenCalledTimes(1);
    expect(activityInsertManyMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Request received",
        resetToken: expect.any(String),
        expiresInMinutes: 30,
      })
    );
  });

  it("should accept blank password reset requests without revealing account existence", async () => {
    const res = createResponse();
    await authController.requestPasswordReset({ body: { email: "" } } as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "Request received" });
  });

  it("should reject invalid reset password payloads and reset used tokens successfully", async () => {
    const missingRes = createResponse();
    await authController.resetPassword({ body: { token: "", newPassword: "" } } as never, missingRes as never, vi.fn());
    expect(missingRes.status).toHaveBeenCalledWith(400);

    const weakRes = createResponse();
    await authController.resetPassword({ body: { token: "token", newPassword: "weak" } } as never, weakRes as never, vi.fn());
    expect(weakRes.status).toHaveBeenCalledWith(400);

    userFindOneMock.mockResolvedValueOnce(null);
    const invalidRes = createResponse();
    await authController.resetPassword({ body: { token: "token", newPassword: "StrongPass123!" } } as never, invalidRes as never, vi.fn());
    expect(invalidRes.status).toHaveBeenCalledWith(400);

    userFindOneMock.mockResolvedValueOnce({ id: "user-1", token_version: 1 });
    userUpdateOneMock.mockResolvedValueOnce({ modifiedCount: 1 });
    const successRes = createResponse();
    await authController.resetPassword(
      { body: { token: "reset-token", newPassword: "StrongPass123!" } } as never,
      successRes as never,
      vi.fn()
    );
    expect(hashMock).toHaveBeenCalledWith("StrongPass123!", 10);
    expect(successRes.json).toHaveBeenCalledWith({ message: "Password reset successful" });
  });

  it("should validate changePassword scenarios and reissue the session on success", async () => {
    const unauthorizedRes = createResponse();
    await authController.changePassword({ user: undefined } as never, unauthorizedRes as never, vi.fn());
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    const missingRes = createResponse();
    await authController.changePassword(
      { user: { userId: "user-1" }, body: { oldPassword: "", newPassword: "" } } as never,
      missingRes as never,
      vi.fn()
    );
    expect(missingRes.status).toHaveBeenCalledWith(400);

    const sameRes = createResponse();
    await authController.changePassword(
      { user: { userId: "user-1" }, body: { oldPassword: "SamePass123!X", newPassword: "SamePass123!X" } } as never,
      sameRes as never,
      vi.fn()
    );
    expect(sameRes.status).toHaveBeenCalledWith(400);

    userFindByIdMock.mockResolvedValue(null);
    const notFoundRes = createResponse();
    await authController.changePassword(
      { user: { userId: "missing" }, body: { oldPassword: "OldPass123!", newPassword: "NewPass123!X" } } as never,
      notFoundRes as never,
      vi.fn()
    );
    expect(notFoundRes.status).toHaveBeenCalledWith(404);

    compareMock.mockResolvedValueOnce(false);
    userFindByIdMock.mockResolvedValue({ password_hash: "stored-hash" });
    const invalidCurrentRes = createResponse();
    await authController.changePassword(
      { user: { userId: "user-1" }, body: { oldPassword: "Wrong123!", newPassword: "NewPass123!X" } } as never,
      invalidCurrentRes as never,
      vi.fn()
    );
    expect(invalidCurrentRes.status).toHaveBeenCalledWith(400);

    const saveMock = vi.fn().mockResolvedValue(undefined);
    compareMock.mockResolvedValueOnce(true);
    userFindByIdMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      role: "office_head",
      roles: ["office_head", "procurement_officer"],
      active_role: "office_head",
      location_id: { toString: () => "office-1" },
      token_version: 2,
      password_hash: "stored-hash",
      save: saveMock,
    });
    const successRes = createResponse();
    await authController.changePassword(
      { user: { userId: "user-1" }, body: { oldPassword: "OldPass123!", newPassword: "NewPass123!X" } } as never,
      successRes as never,
      vi.fn()
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(successRes.json).toHaveBeenCalledWith({ message: "Password updated" });
  });

  it("should validate active role changes, skip saves for delegated roles, and logout cleanly", async () => {
    const missingRoleRes = createResponse();
    await authController.setActiveRole(
      { user: { userId: "user-1" }, body: { activeRole: "" } } as never,
      missingRoleRes as never,
      vi.fn()
    );
    expect(missingRoleRes.status).toHaveBeenCalledWith(400);

    userFindByIdMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      role: "employee",
      roles: ["employee"],
      active_role: "employee",
      location_id: { toString: () => "office-1" },
      token_version: 1,
      save: vi.fn(),
    });
    const delegatedRes = createResponse();
    await authController.setActiveRole(
      {
        user: { userId: "user-1", roles: ["employee", "caretaker"] },
        body: { activeRole: "caretaker" },
      } as never,
      delegatedRes as never,
      vi.fn()
    );
    expect(delegatedRes.json).toHaveBeenCalledWith({
      role: "caretaker",
      activeRole: "caretaker",
      roles: ["employee", "caretaker"],
    });

    const logoutRes = createResponse();
    await authController.logout({} as never, logoutRes as never, vi.fn());
    expect(logoutRes.clearCookie).toHaveBeenCalledTimes(2);
    expect(logoutRes.status).toHaveBeenCalledWith(204);
  });
});
