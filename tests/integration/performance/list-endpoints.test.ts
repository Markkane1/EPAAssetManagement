import mongoose from "mongoose";
import request from "supertest";

import {
  cleanupSecurityContext,
  login,
  seedSecurityData,
  TEST_PASSWORD,
  type SeededContext,
} from "../../../server/tests/security/_helpers";

jest.setTimeout(30000);

describe("performance and regression checks for list endpoints", () => {
  let ctx: SeededContext;

  beforeAll(async () => {
    ctx = await seedSecurityData();
  });

  afterAll(async () => {
    await cleanupSecurityContext(ctx);
  });

  it("should keep GET /api/users to four database operations or fewer for a 50-user page", async () => {
    const adminAgent = request.agent(ctx.app);
    await login(adminAgent, ctx.users.admin.email, TEST_PASSWORD);

    const { UserModel } = ctx.models;
    const officeId = ctx.offices.officeA.id;

    await UserModel.insertMany(
      Array.from({ length: 50 }, (_, index) => ({
        email: `perf-user-${index}@test.example`,
        password_hash: "hashed",
        role: "employee",
        roles: ["employee"],
        active_role: "employee",
        first_name: "Perf",
        last_name: `User${index}`,
        location_id: officeId,
      }))
    );

    const operations: string[] = [];
    mongoose.set("debug", (collectionName, methodName) => {
      operations.push(`${String(collectionName)}.${String(methodName)}`);
    });

    const res = await adminAgent.get("/api/users");

    mongoose.set("debug", false);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(50);
    expect(operations.length).toBeLessThanOrEqual(4);
    expect(res.body[0]).not.toHaveProperty("password");
    expect(res.body[0]).not.toHaveProperty("password_hash");
    expect(res.body[0]).not.toHaveProperty("__v");
  });
});
