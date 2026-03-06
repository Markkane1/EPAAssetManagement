import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import {
  buildAuthPayload,
  cleanupSecurityContext,
  requestRoute,
  seedSecurityData,
  signBearerToken,
  TEST_JWT_SECRET,
  TEST_OBJECT_ID,
  type RouteSpec,
  type SeededContext,
} from "../../../server/tests/security/_helpers";

jest.setTimeout(30000);

describe("security: authentication bypass coverage", () => {
  let ctx: SeededContext;
  const protectedRoutes = discoverProtectedRoutes();

  beforeAll(async () => {
    ctx = await seedSecurityData();
  });

  afterAll(async () => {
    await cleanupSecurityContext(ctx);
  });

  it("should reject missing, malformed, wrong-secret, and expired tokens on every protected route", async () => {
    const wrongSecretToken = jwt.sign(buildAuthPayload(ctx.users.admin), "not-the-right-secret", {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const expiredToken = signBearerToken(buildAuthPayload(ctx.users.admin), {
      algorithm: "HS256",
      expiresIn: -1,
    });

    const failures: Array<{ route: string; scenario: string; status: number }> = [];

    for (const route of protectedRoutes) {
      const noToken = await requestRoute(ctx.app, route);
      if (noToken.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, scenario: "no token", status: noToken.status });
      }

      const malformed = await requestRoute(ctx.app, route, { token: "bad.token.value" });
      if (malformed.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, scenario: "malformed token", status: malformed.status });
      }

      const wrongSecret = await requestRoute(ctx.app, route, { token: wrongSecretToken });
      if (wrongSecret.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, scenario: "wrong secret", status: wrongSecret.status });
      }

      const expired = await requestRoute(ctx.app, route, { token: expiredToken });
      if (expired.status !== 401) {
        failures.push({ route: `${route.method} ${route.path}`, scenario: "expired token", status: expired.status });
      }
    }

    expect(failures).toEqual([]);
    expect(TEST_JWT_SECRET).toHaveLength(32);
  });
});

function normalizePath(prefix: string, routePath: string) {
  const joined = `${prefix}/${routePath}`.replace(/\/+/g, "/");
  return joined.replace(/\/+$/, "") || "/";
}

function discoverProtectedRoutes(): RouteSpec[] {
  const workspaceRoot = path.resolve(process.cwd());
  const routesIndexPath = path.join(workspaceRoot, "server", "src", "routes", "index.ts");
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
