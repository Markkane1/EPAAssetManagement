import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  buildAuthPayload,
  cleanupSecurityContext,
  discoverProtectedRoutes,
  login,
  requestRoute,
  seedSecurityData,
  signBearerToken,
} from './_helpers';

async function main() {
  const ctx = await seedSecurityData();
  try {
    const routes = discoverProtectedRoutes();
    assert.ok(routes.length > 0, 'Expected protected routes to be discovered');

    const adminAgent = request.agent(ctx.app);
    const adminSession = await login(adminAgent, ctx.users.admin.email, ctx.password);
    const validPayload = buildAuthPayload(ctx.users.admin);

    const algNoneToken = jwt.sign(validPayload, '', { algorithm: 'none' as jwt.Algorithm });

    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rs256Token = jwt.sign(validPayload, privateKey, { algorithm: 'RS256', expiresIn: '5m' });

    const validToken = signBearerToken(validPayload, { expiresIn: '5m' });
    const invalidSignatureToken = `${validToken.slice(0, -3)}abc`;
    const expiredToken = signBearerToken(
      { ...validPayload, exp: Math.floor(Date.now() / 1000) - 1 },
      { noTimestamp: true }
    );
    const noExpToken = signBearerToken(validPayload, { noTimestamp: false });
    const decodedLoginToken = jwt.decode(adminSession.authToken) as jwt.JwtPayload | null;

    assert.ok(decodedLoginToken && typeof decodedLoginToken.exp === 'number', 'Issued login token must contain exp claim');

    for (const route of routes) {
      const noneRes = await requestRoute(ctx.app, route, { token: algNoneToken });
      assert.equal(noneRes.status, 401, `alg:none token must be rejected for ${route.method} ${route.path}`);

      const switchRes = await requestRoute(ctx.app, route, { token: rs256Token });
      assert.equal(switchRes.status, 401, `RS256 token must be rejected for HS256 route ${route.method} ${route.path}`);

      const badSigRes = await requestRoute(ctx.app, route, { token: invalidSignatureToken });
      assert.equal(badSigRes.status, 401, `Invalid signature token must be rejected for ${route.method} ${route.path}`);

      const expiredRes = await requestRoute(ctx.app, route, { token: expiredToken });
      assert.equal(expiredRes.status, 401, `Expired token must be rejected for ${route.method} ${route.path}`);

      const noExpRes = await requestRoute(ctx.app, route, { token: noExpToken });
      assert.equal(noExpRes.status, 401, `Token without exp must be rejected for ${route.method} ${route.path}`);
    }

    console.log(`JWT security tests passed across ${routes.length} protected route(s).`);
  } finally {
    await cleanupSecurityContext(ctx);
  }
}

main().catch((error) => {
  console.error('JWT security tests failed.');
  console.error(error);
  process.exit(1);
});
