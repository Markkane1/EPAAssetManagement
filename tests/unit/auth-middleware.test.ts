import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyMock = vi.fn();
const findByIdMock = vi.fn();
const roleDelegationFindMock = vi.fn();

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: (...args: unknown[]) => verifyMock(...args),
  },
  verify: (...args: unknown[]) => verifyMock(...args),
}));

vi.mock("../../server/src/config/env", () => ({
  env: {
    jwtSecret: "test-secret",
    jwtInvalidateBefore: 0,
  },
}));

vi.mock("../../server/src/models/user.model", () => ({
  UserModel: {
    findById: (...args: unknown[]) => findByIdMock(...args),
  },
}));

vi.mock("../../server/src/models/roleDelegation.model", () => ({
  RoleDelegationModel: {
    find: (...args: unknown[]) => roleDelegationFindMock(...args),
  },
}));

import { optionalAuth, requireAuth } from "../../server/src/middleware/auth";

function createResponse() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createDelegationQuery(result: unknown[]) {
  return {
    lean: () => ({
      exec: async () => result,
    }),
  };
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleDelegationFindMock.mockReturnValue(createDelegationQuery([]));
  });

  it("should return 401 when no bearer token or auth cookie is present", async () => {
    const req = { headers: {}, cookies: {} };
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 for invalid signatures, missing exp, invalid roles, and invalid token versions", async () => {
    const res = createResponse();

    verifyMock.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });
    await requireAuth({ headers: { authorization: "Bearer broken-token" }, cookies: {} } as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);

    verifyMock.mockReturnValueOnce({
      userId: "user-1",
      email: "user@example.com",
      role: "employee",
      activeRole: "employee",
      roles: ["employee"],
      locationId: "office-1",
      tokenVersion: 0,
    });
    const noExpRes = createResponse();
    await requireAuth({ headers: { authorization: "Bearer missing-exp" }, cookies: {} } as never, noExpRes as never, vi.fn());
    expect(noExpRes.status).toHaveBeenCalledWith(401);

    verifyMock.mockReturnValueOnce({
      userId: "user-1",
      email: "user@example.com",
      role: "employee",
      activeRole: "unknown-role",
      roles: ["employee"],
      locationId: "office-1",
      tokenVersion: 0,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const invalidRoleRes = createResponse();
    await requireAuth({ headers: { authorization: "Bearer invalid-role" }, cookies: {} } as never, invalidRoleRes as never, vi.fn());
    expect(invalidRoleRes.status).toHaveBeenCalledWith(401);

    verifyMock.mockReturnValueOnce({
      userId: "user-1",
      email: "user@example.com",
      role: "employee",
      activeRole: "employee",
      roles: ["employee"],
      locationId: "office-1",
      tokenVersion: -1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const invalidVersionRes = createResponse();
    await requireAuth({ headers: { authorization: "Bearer invalid-version" }, cookies: {} } as never, invalidVersionRes as never, vi.fn());
    expect(invalidVersionRes.status).toHaveBeenCalledWith(401);
  });

  it("should reject requests when the hydrated user no longer exists, is inactive, or has a mismatched token version", async () => {
    const payload = {
      userId: "user-1",
      email: "user@example.com",
      role: "employee",
      activeRole: "employee",
      roles: ["employee"],
      locationId: "office-1",
      isOrgAdmin: false,
      tokenVersion: 2,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    verifyMock.mockReturnValue(payload);
    findByIdMock.mockResolvedValueOnce(null);
    const missingRes = createResponse();
    await requireAuth({ headers: { authorization: "Bearer valid-token" }, cookies: {} } as never, missingRes as never, vi.fn());
    expect(missingRes.status).toHaveBeenCalledWith(401);

    verifyMock.mockReturnValue(payload);
    findByIdMock.mockResolvedValueOnce({ is_active: false });
    const inactiveRes = createResponse();
    await requireAuth({ headers: { authorization: "Bearer valid-token" }, cookies: {} } as never, inactiveRes as never, vi.fn());
    expect(inactiveRes.status).toHaveBeenCalledWith(401);

    verifyMock.mockReturnValue(payload);
    findByIdMock.mockResolvedValueOnce({
      _id: "user-1",
      id: "user-1",
      email: "user@example.com",
      is_active: true,
      role: "employee",
      roles: ["employee"],
      active_role: "employee",
      location_id: { toString: () => "office-1" },
      token_version: 9,
    });
    const mismatchRes = createResponse();
    await requireAuth({ headers: { authorization: "Bearer valid-token" }, cookies: {} } as never, mismatchRes as never, vi.fn());
    expect(mismatchRes.status).toHaveBeenCalledWith(401);
  });

  it("should attach the hydrated user context, merge delegated roles, and call next for a valid token", async () => {
    verifyMock.mockReturnValue({
      userId: "user-1",
      email: "user@example.com",
      role: "employee",
      activeRole: "caretaker",
      roles: ["employee", "caretaker"],
      locationId: "office-1",
      isOrgAdmin: false,
      tokenVersion: 2,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    });
    findByIdMock.mockResolvedValue({
      _id: "user-1",
      id: "user-1",
      email: "user@example.com",
      is_active: true,
      role: "employee",
      roles: ["employee"],
      active_role: "employee",
      location_id: { toString: () => "office-1" },
      token_version: 2,
    });
    roleDelegationFindMock.mockReturnValue(
      createDelegationQuery([
        { delegated_roles: ["caretaker"], office_id: "office-1" },
        { delegated_roles: ["office_head"], office_id: "other-office" },
      ])
    );

    const req: Record<string, unknown> = { headers: {}, cookies: { auth_token: "cookie-token" } };
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req as never, res as never, next);

    expect(verifyMock).toHaveBeenCalledWith("cookie-token", "test-secret", { algorithms: ["HS256"] });
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: "user-1",
      role: "caretaker",
      activeRole: "caretaker",
      roles: ["employee", "caretaker"],
      locationId: "office-1",
      tokenVersion: 2,
    });
  });

  it("should ignore malformed optional tokens and continue without a user context", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("jwt malformed");
    });

    const req: Record<string, unknown> = {
      headers: { authorization: "Bearer malformed-token" },
      cookies: {},
    };
    const next = vi.fn();

    await optionalAuth(req as never, createResponse() as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it("should hydrate optional auth requests when a valid cookie token is present", async () => {
    verifyMock.mockReturnValue({
      userId: "user-2",
      email: "admin@example.com",
      role: "org_admin",
      activeRole: "org_admin",
      roles: ["org_admin"],
      locationId: null,
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    });
    findByIdMock.mockResolvedValue({
      _id: "user-2",
      id: "user-2",
      email: "admin@example.com",
      is_active: true,
      role: "org_admin",
      roles: ["org_admin"],
      active_role: "org_admin",
      location_id: null,
      token_version: 1,
    });

    const req: Record<string, unknown> = { headers: {}, cookies: { auth_token: "optional-cookie" } };
    const next = vi.fn();

    await optionalAuth(req as never, createResponse() as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: "user-2",
      role: "org_admin",
      activeRole: "org_admin",
      isOrgAdmin: true,
    });
  });
});
