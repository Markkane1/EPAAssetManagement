import assert from 'node:assert/strict';
import request from 'supertest';
import {
  cleanupSecurityContext,
  discoverProtectedRoutes,
  login,
  materializeRoutePath,
  requestRoute,
  seedSecurityData,
} from './_helpers';

async function main() {
  const ctx = await seedSecurityData();
  try {
    const routes = discoverProtectedRoutes();
    assert.ok(routes.length > 0, 'Expected protected routes to be discovered');

    const adminAgent = request.agent(ctx.app);
    const employeeAAgent = request.agent(ctx.app);
    const employeeBAgent = request.agent(ctx.app);
    const officeHeadBAgent = request.agent(ctx.app);

    const adminSession = await login(adminAgent, ctx.users.admin.email, ctx.password);
    const employeeASession = await login(employeeAAgent, ctx.users.employeeA.email, ctx.password);
    await login(employeeBAgent, ctx.users.employeeB.email, ctx.password);
    await login(officeHeadBAgent, ctx.users.officeHeadB.email, ctx.password);

    for (const route of routes) {
      const noAuthRes = await requestRoute(ctx.app, route);
      assert.equal(noAuthRes.status, 401, `Missing auth must be rejected for ${route.method} ${route.path}`);

      const emptyTokenRes = await requestRoute(ctx.app, route, { token: '' });
      assert.equal(emptyTokenRes.status, 401, `Empty bearer token must be rejected for ${route.method} ${route.path}`);

      const nullTokenRes = await requestRoute(ctx.app, route, { token: 'null' });
      assert.equal(nullTokenRes.status, 401, `Bearer null must be rejected for ${route.method} ${route.path}`);

      const undefinedTokenRes = await requestRoute(ctx.app, route, { token: 'undefined' });
      assert.equal(undefinedTokenRes.status, 401, `Bearer undefined must be rejected for ${route.method} ${route.path}`);
    }

    const activityReadRes = await employeeBAgent.get(`/api/activities/user/${ctx.users.employeeA.id}`);
    assert.ok([403, 404].includes(activityReadRes.status), 'Employee B must not read Employee A private activity stream');

    const assignment = await ctx.models.AssignmentModel.findOne({}).lean();
    assert.ok(assignment?._id, 'Expected seeded assignment for Employee A');
    const maintenance = await ctx.models.MaintenanceRecordModel.findOne({}).lean();
    assert.ok(maintenance?._id, 'Expected seeded maintenance record');

    const crossOfficeAssignmentUpdate = await officeHeadBAgent
      .put(`/api/assignments/${String(assignment?._id)}`)
      .send({ notes: 'cross-office tamper' });
    assert.ok([403, 404].includes(crossOfficeAssignmentUpdate.status), 'Cross-office assignment update must be denied');

    const crossOfficeAssignmentDelete = await officeHeadBAgent.delete(`/api/assignments/${String(assignment?._id)}`);
    assert.ok([403, 404].includes(crossOfficeAssignmentDelete.status), 'Cross-office assignment delete must be denied');

    const crossOfficeMaintenanceUpdate = await officeHeadBAgent
      .put(`/api/maintenance/${String(maintenance?._id)}`)
      .send({ notes: 'cross-office tamper' });
    assert.ok([403, 404].includes(crossOfficeMaintenanceUpdate.status), 'Cross-office maintenance update must be denied');

    const adminOnlyRoutes = [
      ['GET', '/api/users'],
      ['POST', '/api/users'],
      ['GET', '/api/settings'],
      ['PUT', '/api/settings'],
      ['POST', '/api/offices'],
      ['POST', '/api/districts'],
      ['POST', '/api/divisions'],
    ] as const;

    for (const [method, path] of adminOnlyRoutes) {
      let req = (employeeAAgent as any)[method.toLowerCase()](materializeRoutePath(path));
      if (method !== 'GET') {
        req = req.set('x-csrf-token', employeeASession.csrfToken).send({});
      }
      const res = await req;
      assert.equal(res.status, 403, `Regular user must not access admin route ${method} ${path}`);
    }

    const tamperedCreate = await adminAgent
      .post('/api/users')
      .set('x-csrf-token', adminSession.csrfToken)
      .send({
        email: 'tampered-user@test.example',
        password: ctx.password,
        role: 'employee',
        isAdmin: true,
        __proto__: { isAdmin: true },
      });
    assert.equal(tamperedCreate.status, 201, 'Admin user creation should succeed with ignored tamper fields');

    const createdUser = await ctx.models.UserModel.findById(tamperedCreate.body.id).lean();
    assert.ok(createdUser, 'Created user must exist');
    assert.equal(createdUser?.role, 'employee', 'Role must remain the requested non-admin role');
    assert.equal((createdUser as any)?.isAdmin, undefined, 'isAdmin body field must not persist');

    const resetRequest = await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ email: ctx.users.employeeA.email });
    assert.equal(resetRequest.status, 200, 'Forgot password must succeed');
    assert.ok(resetRequest.body.resetToken, 'Reset token should be exposed in test mode');

    const firstReset = await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ token: resetRequest.body.resetToken, newPassword: 'ResetPass!2026A' });
    assert.equal(firstReset.status, 200, 'First reset must succeed');

    const secondReset = await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ token: resetRequest.body.resetToken, newPassword: 'ResetPass!2026B' });
    assert.equal(secondReset.status, 400, 'Reset token must be one-time use');

    const secondTokenRequest = await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ email: ctx.users.employeeB.email });
    assert.equal(secondTokenRequest.status, 200, 'Second reset request must succeed');

    await ctx.models.UserModel.findByIdAndUpdate(ctx.users.employeeB.id, {
      password_reset_expires_at: new Date(Date.now() - 60_000),
    });
    const expiredReset = await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ token: secondTokenRequest.body.resetToken, newPassword: 'ExpiredPass!2026A' });
    assert.equal(expiredReset.status, 400, 'Expired reset token must fail');

    console.log(`Authorization tests passed across ${routes.length} protected route(s).`);
  } finally {
    await cleanupSecurityContext(ctx);
  }
}

main().catch((error) => {
  console.error('Authorization tests failed.');
  console.error(error);
  process.exit(1);
});


