import assert from 'node:assert/strict';
import request from 'supertest';
import {
  cleanupSecurityContext,
  discoverProtectedRoutes,
  login,
  seedSecurityData,
} from './_helpers';

async function main() {
  const ctx = await seedSecurityData();
  try {
    const adminAgent = request.agent(ctx.app);
    const adminSession = await login(adminAgent, ctx.users.admin.email, ctx.password);

    const bypassPayloads = [
      { email: { $gt: '' }, password: { $gt: '' } },
      { email: ctx.users.admin.email, password: { $ne: 'wrongpassword' } },
    ];
    for (const payload of bypassPayloads) {
      const res = await request(ctx.app).post('/api/auth/login').send(payload);
      assert.equal(res.status, 401, 'Login NoSQL injection payload must not bypass authentication');
    }

    const operatorPayload = {
      name: { $ne: null },
      officeId: ctx.offices.officeA.id,
      email: { $regex: '.*' },
    };
    const injectedCreate = await adminAgent.post('/api/vendors').send(operatorPayload);
    assert.ok([400, 201].includes(injectedCreate.status), 'Operator injection payload must be rejected or safely neutralized');
    if (injectedCreate.status === 201) {
      const created = await ctx.models.VendorModel.findById(injectedCreate.body._id || injectedCreate.body.id).lean();
      assert.ok(created, 'Neutralized vendor create should persist a document if accepted');
      assert.notEqual(typeof created?.name, 'object', 'Sanitized operator payload must not persist as an object');
    }

    const regexProbe = `${'a'.repeat(10000)}!`;
    const start = Date.now();
    const regexDosRes = await adminAgent.get(`/api/vendors?search=${encodeURIComponent(regexProbe)}`);
    const duration = Date.now() - start;
    assert.ok(duration < 2000, `Regex-based search must return within 2 seconds, took ${duration}ms`);
    assert.ok([200, 400].includes(regexDosRes.status), 'Regex probe must not crash the server');

    const validatedParamRoutes = discoverProtectedRoutes().filter(
      (route) => route.middlewares.includes('validateParams') && route.path.includes(':')
    );
    assert.ok(validatedParamRoutes.length > 0, 'Expected validated parameterized routes');

    for (const route of validatedParamRoutes) {
      const pathWithBadId = route.path.replace(/:[A-Za-z0-9_]+/g, 'not-an-id');
      const badIdRes = await request(ctx.app)[route.method.toLowerCase() as 'get'](pathWithBadId)
        .set('Authorization', `Bearer ${adminSession.authToken}`);
      assert.equal(badIdRes.status, 400, `Invalid ObjectId must return 400 for ${route.method} ${route.path}`);

      const oversizedId = 'a'.repeat(1000);
      const oversizedPath = route.path.replace(/:[A-Za-z0-9_]+/g, oversizedId);
      const oversizedRes = await request(ctx.app)[route.method.toLowerCase() as 'get'](oversizedPath)
        .set('Authorization', `Bearer ${adminSession.authToken}`);
      assert.equal(oversizedRes.status, 400, `Oversized ObjectId must return 400 for ${route.method} ${route.path}`);
    }

    console.log(`NoSQL injection tests passed across ${validatedParamRoutes.length} validated param route(s).`);
  } finally {
    await cleanupSecurityContext(ctx);
  }
}

main().catch((error) => {
  console.error('NoSQL injection tests failed.');
  console.error(error);
  process.exit(1);
});
