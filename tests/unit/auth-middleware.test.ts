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

  it("should return 401 when JWT verification throws for an invalid token", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const req = { headers: { authorization: "Bearer broken-token" }, cookies: {} };
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req as never, res as never, next);

    expect(verifyMock).toHaveBeenCalledWith("broken-token", "test-secret", {
      algorithms: ["HS256"],
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when the verified token is missing an exp claim", async () => {
    verifyMock.mockReturnValue({
      userId: "user-1",
      email: "user@example.com",
      role: "employee",
      activeRole: "employee",
      roles: ["employee"],
      locationId: "office-1",
      tokenVersion: 0,
    });

    const req = { headers: { authorization: "Bearer missing-exp" }, cookies: {} };
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should attach the hydrated user context and call next for a valid token", async () => {
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
      roles: ["employee", "caretaker"],
      active_role: "caretaker",
      location_id: { toString: () => "office-1" },
      token_version: 2,
    });

    const req: Record<string, unknown> = {
      headers: { authorization: "Bearer valid-token" },
      cookies: {},
    };
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req as never, res as never, next);

    expect(findByIdMock).toHaveBeenCalledWith("user-1");
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: "user-1",
      email: "user@example.com",
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
    const res = createResponse();
    const next = vi.fn();

    await optionalAuth(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });
});
