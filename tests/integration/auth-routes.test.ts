import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import request from "supertest";
import { cleanupSecurityContext, login, seedSecurityData, TEST_PASSWORD, type SeededContext } from "../security/_helpers";
import { UserModel } from "../../server/src/models/user.model";

jest.setTimeout(30000);

describe("auth routes integration", () => {
  let ctx: SeededContext;

  beforeAll(async () => {
    ctx = await seedSecurityData();
  });

  afterAll(async () => {
    await cleanupSecurityContext(ctx);
  });

  it("should cover login validation and the authenticated auth lifecycle end to end", async () => {
    const success = await request(ctx.app)
      .post("/api/auth/login")
      .send({ email: ctx.users.admin.email, password: TEST_PASSWORD });
    expect(success.status).toBe(200);
    expect(success.headers["set-cookie"]?.join(";")).toContain("auth_token=");

    const wrongPassword = await request(ctx.app)
      .post("/api/auth/login")
      .send({ email: ctx.users.admin.email, password: "wrong" });
    expect(wrongPassword.status).toBe(401);

    const missingFields = await request(ctx.app)
      .post("/api/auth/login")
      .send({ email: "", password: "" });
    expect(missingFields.status).toBe(400);

    const adminAgent = request.agent(ctx.app);
    const adminSession = await login(adminAgent, ctx.users.admin.email, TEST_PASSWORD);

    const meRes = await adminAgent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(ctx.users.admin.email);
    expect(meRes.body).not.toHaveProperty("password_hash");

    const createRes = await adminAgent
      .post("/api/auth/register")
      .set("x-csrf-token", adminSession.csrfToken)
      .send({
        email: "new.user@test.example",
        password: "StrongPass123!",
        firstName: "New",
        lastName: "User",
        roles: ["employee"],
      });
    expect(createRes.status).toBe(201);

    const duplicateRes = await adminAgent
      .post("/api/auth/register")
      .set("x-csrf-token", adminSession.csrfToken)
      .send({ email: "new.user@test.example", password: "StrongPass123!" });
    expect(duplicateRes.status).toBe(409);

    const employeeAgent = request.agent(ctx.app);
    const employeeSession = await login(employeeAgent, ctx.users.employeeA.email, TEST_PASSWORD);
    const forbiddenRes = await employeeAgent
      .post("/api/auth/register")
      .set("x-csrf-token", employeeSession.csrfToken)
      .send({ email: "blocked.user@test.example", password: "StrongPass123!" });
    expect(forbiddenRes.status).toBe(403);

    const forgotRes = await request(ctx.app)
      .post("/api/auth/forgot-password")
      .send({ email: ctx.users.employeeA.email });
    expect(forgotRes.status).toBe(200);

    const userAfterForgot = await UserModel.findById(ctx.users.employeeA.id);
    expect(userAfterForgot?.password_reset_token_hash).toBeTruthy();
    expect(userAfterForgot?.password_reset_expires_at).toBeTruthy();

    const knownToken = "known-reset-token";
    const tokenHash = crypto.createHash("sha256").update(knownToken).digest("hex");
    await UserModel.updateOne(
      { _id: ctx.users.employeeA.id },
      {
        $set: {
          password_reset_token_hash: tokenHash,
          password_reset_expires_at: new Date(Date.now() + 10 * 60_000),
          password_reset_requested_at: new Date(),
        },
      }
    );

    const resetRes = await request(ctx.app)
      .post("/api/auth/reset-password")
      .send({ token: knownToken, newPassword: "ResetPass123!" });
    expect(resetRes.status).toBe(200);

    const reusedRes = await request(ctx.app)
      .post("/api/auth/reset-password")
      .send({ token: knownToken, newPassword: "AnotherPass123!" });
    expect(reusedRes.status).toBe(400);

    const employeeBAgent = request.agent(ctx.app);
    const employeeBSession = await login(employeeBAgent, ctx.users.employeeB.email, TEST_PASSWORD);
    const employeeBBefore = await UserModel.findById(ctx.users.employeeB.id);
    const previousTokenVersion = Number(employeeBBefore?.token_version || 0);

    const changePasswordRes = await employeeBAgent
      .post("/api/auth/change-password")
      .set("x-csrf-token", employeeBSession.csrfToken)
      .send({ oldPassword: TEST_PASSWORD, newPassword: "ChangedPass123!" });
    expect(changePasswordRes.status).toBe(200);

    const employeeBAfter = await UserModel.findById(ctx.users.employeeB.id);
    expect(Number(employeeBAfter?.token_version || 0)).toBe(previousTokenVersion + 1);
    expect(await bcrypt.compare("ChangedPass123!", String(employeeBAfter?.password_hash))).toBe(true);

    await UserModel.create({
      email: "multi-role@test.example",
      password_hash: await bcrypt.hash("MultiPass123!", 10),
      role: "office_head",
      roles: ["office_head", "procurement_officer"],
      active_role: "office_head",
    });
    const multiRoleAgent = request.agent(ctx.app);
    const multiRoleSession = await login(multiRoleAgent, "multi-role@test.example", "MultiPass123!");
    const activeRoleRes = await multiRoleAgent
      .post("/api/auth/active-role")
      .set("x-csrf-token", multiRoleSession.csrfToken)
      .send({ activeRole: "procurement_officer" });
    expect(activeRoleRes.status).toBe(200);
    expect(activeRoleRes.body.activeRole).toBe("procurement_officer");

    const logoutRes = await adminAgent
      .post("/api/auth/logout")
      .set("x-csrf-token", adminSession.csrfToken)
      .send({});
    expect(logoutRes.status).toBe(204);
    expect(logoutRes.headers["set-cookie"]?.join(";")).toContain("auth_token=");
  });
});
