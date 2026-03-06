import { beforeEach, describe, expect, it, vi } from "vitest";

const hashMock = vi.fn();
const compareMock = vi.fn();
const jwtSignMock = vi.fn();
const randomBytesMock = vi.fn();
const userFindOneMock = vi.fn();
const userCreateMock = vi.fn();
const userFindByIdMock = vi.fn();

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
    createHash: vi.fn(),
  },
  randomBytes: (...args: unknown[]) => randomBytesMock(...args),
  createHash: vi.fn(),
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
  },
}));

vi.mock("../../server/src/models/employee.model", () => ({
  EmployeeModel: {},
}));

vi.mock("../../server/src/models/activityLog.model", () => ({
  ActivityLogModel: {},
}));

import { authController } from "../../server/src/controllers/auth.controller";

function createResponse() {
  const res: Record<string, unknown> = {};
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
    randomBytesMock.mockReturnValue(Buffer.from("csrf-token-value"));
  });

  it("should reject registration requests from non-admin callers", async () => {
    const req = {
      user: null,
      body: {
        email: "new.user@example.com",
        password: "StrongPass123!",
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await authController.register(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Self-registration is disabled" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject duplicate registration emails before creating a new user", async () => {
    userFindOneMock.mockResolvedValue({ id: "existing-user" });

    const req = {
      user: {
        role: "org_admin",
        isOrgAdmin: true,
      },
      body: {
        email: "existing@example.com",
        password: "StrongPass123!",
        role: "employee",
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await authController.register(req as never, res as never, next);

    expect(userFindOneMock).toHaveBeenCalledWith({ email: "existing@example.com" });
    expect(userCreateMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: "Email already in use" });
  });

  it("should reject login payloads that do not contain string credentials", async () => {
    const req = {
      body: {
        email: { $gt: "" },
        password: ["not-a-string"],
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await authController.login(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
    expect(next).not.toHaveBeenCalled();
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

    const req = {
      body: {
        email: "admin@example.com",
        password: "Admin123!",
      },
    };
    const res = createResponse();
    const next = vi.fn();

    await authController.login(req as never, res as never, next);

    expect(compareMock).toHaveBeenCalledWith("Admin123!", "stored-hash");
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(jwtSignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "admin@example.com",
        activeRole: "office_head",
        roles: ["employee", "office_head"],
        tokenVersion: 3,
      }),
      "test-secret",
      { expiresIn: "1h" }
    );
    expect(res.cookie).toHaveBeenNthCalledWith(
      1,
      "auth_token",
      "signed.jwt.token",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 3600000 })
    );
    expect(res.cookie).toHaveBeenNthCalledWith(
      2,
      "csrf_token",
      Buffer.from("csrf-token-value").toString("hex"),
      expect.objectContaining({ httpOnly: false, sameSite: "lax", maxAge: 3600000 })
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "x-csrf-token",
      Buffer.from("csrf-token-value").toString("hex")
    );
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
    expect(next).not.toHaveBeenCalled();
  });

  it("should return the authenticated user profile and refresh the CSRF cookie when it is missing", async () => {
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

    const req = {
      user: { userId: "user-1" },
      cookies: {},
    };
    const res = createResponse();
    const next = vi.fn();

    await authController.me(req as never, res as never, next);

    expect(userFindByIdMock).toHaveBeenCalledWith("user-1");
    expect(res.cookie).toHaveBeenCalledWith(
      "csrf_token",
      Buffer.from("csrf-token-value").toString("hex"),
      expect.objectContaining({ httpOnly: false, sameSite: "lax", maxAge: 3600000 })
    );
    expect(res.json).toHaveBeenCalledWith({
      id: "user-1",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      role: "office_head",
      activeRole: "office_head",
      roles: ["employee", "office_head"],
      locationId: "office-1",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
