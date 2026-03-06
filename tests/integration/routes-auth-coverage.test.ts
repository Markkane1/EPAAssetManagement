import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import {
  buildAuthPayload,
  cleanupSecurityContext,
  requestRoute,
  seedSecurityData,
  signBearerToken,
  type RouteSpec,
  type SeededContext,
} from "../../server/tests/security/_helpers";

jest.setTimeout(30000);

const workspaceRoot = path.resolve(process.cwd());
const routesIndexPath = path.join(workspaceRoot, "server", "src", "routes", "index.ts");
const TEST_OBJECT_ID = "507f1f77bcf86cd799439011";

function normalizePath(prefix: string, routePath: string) {
  const joined = `${prefix}/${routePath}`.replace(/\/+/g, "/");
  return joined.replace(/\/+$/, "") || "/";
}

function discoverProtectedRoutes(): RouteSpec[] {
  const indexSource = fs.readFileSync(routesIndexPath, "utf8");
  const importMatches = [...indexSource.matchAll(/import\s+(\w+)\s+from\s+'([^']+)'/g)];
  const importMap = new Map(importMatches.map((match) => [match[1], match[2]]));
  const mountMatches = [...indexSource.matchAll(/router\.use\('([^']+)',\s*(\w+)\);/g)];
  const routes: RouteSpec[] = [];

  for (const match of mountMatches) {
    const mountPath = match[1];
    const alias = match[2];
    const importPath = importMap.get(alias);
    if (!importPath) continue;
    const routeFile = path.resolve(path.dirname(routesIndexPath), `${importPath}.ts`);
    if (!fs.existsSync(routeFile)) continue;
    const source = fs.readFileSync(routeFile, "utf8");
    const flattened = source.replace(/\r?\n/g, " ");
    const globalRequireAuth = /router\.use\(requireAuth\);/.test(source);
    const routeMatches = [
      ...flattened.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([\s\S]*?)\);/g),
    ];

    for (const routeMatch of routeMatches) {
      const method = routeMatch[1].toUpperCase() as RouteSpec["method"];
      const routePath = routeMatch[2].replace(/:[A-Za-z0-9_]+/g, TEST_OBJECT_ID);
      const middlewares = routeMatch[3].replace(/\s+/g, " ").trim();
      if (!globalRequireAuth && !middlewares.includes("requireAuth")) {
        continue;
      }
      const prefix = mountPath === "/" ? "/api" : `/api${mountPath}`;
      routes.push({
        method,
        path: normalizePath(prefix, routePath),
        middlewares,
        sourceFile: path.relative(workspaceRoot, routeFile).replace(/\\/g, "/"),
      });
    }
  }

  return routes
    .filter(
      (route, index, all) =>
        all.findIndex((entry) => entry.method === route.method && entry.path === route.path) === index
    )
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

describe("protected route authentication coverage", () => {
  let ctx: SeededContext;
  const protectedRoutes: RouteSpec[] = discoverProtectedRoutes();
  const roleRestrictedRoutes = protectedRoutes.filter((route) => {
    const middlewares = route.middlewares;
    if (middlewares.includes("requireCsrf")) return false;
    return (
      middlewares.includes("requireAdmin") ||
      middlewares.includes("requireSuperAdmin") ||
      middlewares.includes("requireOrgAdminOrCentralStoreCaretaker") ||
      middlewares.includes("requireRoles(")
    );
  });

  beforeAll(async () => {
    ctx = await seedSecurityData();
  });

  afterAll(async () => {
    await cleanupSecurityContext(ctx);
  });

  it("should discover a non-empty protected route manifest from the mounted Express routers", () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
  });

  it("should return 401 for every protected route when no token is provided", async () => {
    const failures: Array<{ route: string; status: number }> = [];

    for (const route of protectedRoutes) {
      const res = await requestRoute(ctx.app, route);
      if (res.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, status: res.status });
      }
    }

    expect(failures).toEqual([]);
  });

  it("should return 401 for every protected route when the token is malformed", async () => {
    const failures: Array<{ route: string; status: number }> = [];

    for (const route of protectedRoutes) {
      const res = await requestRoute(ctx.app, route, { token: "malformed.token.value" });
      if (res.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, status: res.status });
      }
    }

    expect(failures).toEqual([]);
  });

  it("should return 401 for every protected route when the token is signed with the wrong secret", async () => {
    const wrongSecretToken = jwt.sign(buildAuthPayload(ctx.users.admin), "wrong-secret", {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    const failures: Array<{ route: string; status: number }> = [];
    for (const route of protectedRoutes) {
      const res = await requestRoute(ctx.app, route, { token: wrongSecretToken });
      if (res.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, status: res.status });
      }
    }

    expect(failures).toEqual([]);
  });

  it("should return 401 for every protected route when the token is expired", async () => {
    const expiredToken = signBearerToken(buildAuthPayload(ctx.users.admin), {
      algorithm: "HS256",
      expiresIn: -1,
    });

    const failures: Array<{ route: string; status: number }> = [];
    for (const route of protectedRoutes) {
      const res = await requestRoute(ctx.app, route, { token: expiredToken });
      if (res.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, status: res.status });
      }
    }

    expect(failures).toEqual([]);
  });

  it("should reject regular employees for role-restricted routes", async () => {
    const employeeToken = signBearerToken(buildAuthPayload(ctx.users.employeeA), {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    const failures: Array<{ route: string; status: number }> = [];
    for (const route of roleRestrictedRoutes) {
      const res = await requestRoute(ctx.app, route, { token: employeeToken });
      if (![401, 403].includes(res.status)) {
        failures.push({ route: `${route.method} ${route.path}`, status: res.status });
      }
    }

    expect(failures).toEqual([]);
  });

  it("should expose the public health and OpenAPI routes without authentication", async () => {
    const health = await request(ctx.app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });

    const json = await request(ctx.app).get("/api/openapi.json");
    expect(json.status).toBe(200);
    expect(json.body).toHaveProperty("openapi");

    const yaml = await request(ctx.app).get("/api/openapi.yaml");
    expect(yaml.status).toBe(200);
    expect(yaml.text).toContain("openapi");

    const docs = await request(ctx.app).get("/api/docs");
    expect(docs.status).toBe(200);
    expect(docs.text).toContain("EPA AMS API Documentation");
  });

  it("should reject unknown routes with a safe 404 response", async () => {
    const res = await request(ctx.app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Not found" });
  });
});
