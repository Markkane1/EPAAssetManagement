import request from "supertest";
import {
  cleanupSecurityContext,
  login,
  seedSecurityData,
  type SeededContext,
} from "./_helpers";
import { UserModel } from "../../server/src/models/user.model";

jest.setTimeout(30000);

describe("security: input hardening and response safety", () => {
  let ctx: SeededContext;

  beforeAll(async () => {
    ctx = await seedSecurityData();
  });

  afterAll(async () => {
    await cleanupSecurityContext(ctx);
  });

  it("should cover NoSQL login bypass, mass assignment, response stripping, and XSS hardening", async () => {
    const payloads = [
      { email: { $gt: "" }, password: { $gt: "" } },
      { email: "nobody@test.example", password: { $ne: "wrongpassword" } },
    ];

    for (const payload of payloads) {
      const res = await request(ctx.app).post("/api/auth/login").send(payload);
      expect([400, 401]).toContain(res.status);
      expect(res.body).not.toHaveProperty("user");
    }

    const adminAgent = request.agent(ctx.app);
    const adminSession = await login(adminAgent, ctx.users.admin.email, ctx.password);

    const createUserRes = await adminAgent
      .post("/api/users")
      .set("x-csrf-token", adminSession.csrfToken)
      .send({
        email: "mass-assignment@test.example",
        password: "StrongPass123!",
        role: "employee",
        isAdmin: true,
        __proto__: { isAdmin: true },
      });

    expect(createUserRes.status).toBe(201);

    const created = await UserModel.findOne({ email: "mass-assignment@test.example" }).lean();
    expect(created).toBeTruthy();
    expect((created as Record<string, unknown>)?.isAdmin).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(created || {}, "isAdmin")).toBe(false);

    const meRes = await adminAgent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body).not.toHaveProperty("password_hash");
    expect(meRes.body).not.toHaveProperty("password");

    const usersRes = await adminAgent.get("/api/users");
    expect(usersRes.status).toBe(200);
    const payload = Array.isArray(usersRes.body)
      ? usersRes.body
      : Array.isArray(usersRes.body?.items)
        ? usersRes.body.items
        : [];
    for (const row of payload) {
      expect(row).not.toHaveProperty("password_hash");
      expect(row).not.toHaveProperty("password");
      expect(row).not.toHaveProperty("__v");
    }

    const xssPayload = {
      name: "<script>alert('xss')</script>",
      description: "<img src=x onerror=alert('xss')>",
      assetType: "ASSET",
    };

    const res = await adminAgent
      .post("/api/categories")
      .set("x-csrf-token", adminSession.csrfToken)
      .send(xssPayload);

    expect([201, 400]).toContain(res.status);
    if (res.status === 201) {
      expect(JSON.stringify(res.body)).not.toContain("<script>");
      expect(JSON.stringify(res.body)).not.toContain("onerror=");
    }

    const logoutRes = await adminAgent
      .post("/api/auth/logout")
      .set("x-csrf-token", adminSession.csrfToken)
      .send({});
    expect(logoutRes.status).toBe(204);
  });
});
