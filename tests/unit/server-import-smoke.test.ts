import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.LOAD_DOTENV_IN_TEST = "false";
  process.env.JWT_SECRET = "12345678901234567890123456789012";
  process.env.MONGO_URI = "mongodb://127.0.0.1:27017/test";
  process.env.CORS_ORIGIN = "http://localhost:8080";
  process.env.RATE_LIMIT_BACKEND = "memory";
});

describe("server module import smoke", () => {
  it("should import server config, controllers, middleware, routes, services, and utility modules", async () => {
    const groups = [
      import.meta.glob("../../server/src/config/*.ts"),
      import.meta.glob("../../server/src/controllers/*.ts"),
      import.meta.glob("../../server/src/middleware/*.ts"),
      import.meta.glob("../../server/src/routes/*.ts"),
      import.meta.glob("../../server/src/services/*.ts"),
      import.meta.glob("../../server/src/utils/*.ts"),
      import.meta.glob("../../server/src/repositories/*.ts"),
      import.meta.glob("../../server/src/observability/*.ts"),
      import.meta.glob("../../server/src/modules/consumables/controllers/*.ts"),
      import.meta.glob("../../server/src/modules/consumables/services/*.ts"),
      import.meta.glob("../../server/src/modules/consumables/utils/*.ts"),
      import.meta.glob("../../server/src/modules/consumables/routes/*.ts"),
      import.meta.glob("../../server/src/modules/consumables/validators/*.ts"),
      import.meta.glob("../../server/src/modules/records/controllers/*.ts"),
      import.meta.glob("../../server/src/modules/records/services/*.ts"),
      import.meta.glob("../../server/src/modules/records/utils/*.ts"),
      import.meta.glob("../../server/src/modules/records/routes/*.ts"),
      import.meta.glob("../../server/src/modules/records/validators/*.ts"),
      import.meta.glob("../../server/src/app.ts"),
    ];

    for (const group of groups) {
      for (const [file, load] of Object.entries(group)) {
        const mod = await load();
        expect(mod, `expected module to load: ${file}`).toBeTruthy();
      }
    }
  }, 60000);
});
