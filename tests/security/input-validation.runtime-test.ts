import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanupSecurityContext, login, seedSecurityData } from './_helpers';

const XSS_PAYLOADS = [
  "<script>alert('xss')</script>",
  '<img src=x onerror=alert(\'xss\')>',
  'javascript:alert(\'xss\')',
  '<svg onload=alert(\'xss\')>',
  '\"><script>alert(\'xss\')</script>',
];

function containsRawXss(value: unknown) {
  const text = String(value || '').toLowerCase();
  return text.includes('<script') || text.includes('onerror=') || text.includes('onload=') || text.includes('javascript:');
}

async function main() {
  const ctx = await seedSecurityData();
  try {
    const adminAgent = request.agent(ctx.app);
    await login(adminAgent, ctx.users.admin.email, ctx.password);

    for (const payload of XSS_PAYLOADS) {
      const vendorRes = await adminAgent.post('/api/vendors').send({
        name: payload,
        officeId: ctx.offices.officeA.id,
      });
      assert.ok([201, 400].includes(vendorRes.status), 'XSS payload must be rejected or sanitized for vendors');
      if (vendorRes.status === 201) {
        const vendor = await ctx.models.VendorModel.findById(vendorRes.body._id || vendorRes.body.id).lean();
        assert.ok(vendor, 'Vendor must exist after successful create');
        assert.equal(containsRawXss(vendor?.name), false, 'Raw XSS payload must not be stored in vendor name');
        assert.equal(containsRawXss(vendorRes.body.name), false, 'Raw XSS payload must not be reflected in vendor response');
      }

      const documentRes = await adminAgent.post('/api/documents').send({
        title: payload,
        docType: 'Invoice',
        officeId: ctx.offices.officeA.id,
      });
      assert.ok([201, 400].includes(documentRes.status), 'XSS payload must be rejected or sanitized for documents');
      if (documentRes.status === 201) {
        const document = await ctx.models.DocumentModel.findById(documentRes.body.id || documentRes.body._id).lean();
        assert.ok(document, 'Document must exist after successful create');
        assert.equal(containsRawXss((document as any)?.title), false, 'Raw XSS payload must not be stored in document title');
        assert.equal(containsRawXss(documentRes.body.title), false, 'Raw XSS payload must not be reflected in document response');
      }
    }

    const duplicateQueryRes = await adminAgent.get('/api/users?meta=true&meta=false');
    assert.notEqual(duplicateQueryRes.status, 500, 'Duplicate query parameters must not crash user listing');

    const oversized = 'a'.repeat(10 * 1024 * 1024);
    const oversizedRes = await request(ctx.app)
      .post('/api/vendors')
      .set('Cookie', `auth_token=dummy; csrf_token=dummy`)
      .set('x-csrf-token', 'dummy')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: oversized, officeId: String(ctx.offices.officeA.id) }));
    assert.equal(oversizedRes.status, 413, 'Oversized request bodies must return 413');

    const specialCharsRes = await adminAgent.post('/api/vendors').send({
      name: 'test\u0000injection',
      email: '?????@example.com',
      phone: '??',
      address: 'test\r\nHeader: injected',
      officeId: ctx.offices.officeA.id,
    });
    assert.ok([201, 400].includes(specialCharsRes.status), 'Special character payloads must be safely handled');
    assert.notEqual(specialCharsRes.status, 500, 'Special character payloads must not crash the server');

    console.log('Input validation and XSS tests passed.');
  } finally {
    await cleanupSecurityContext(ctx);
  }
}

main().catch((error) => {
  console.error('Input validation and XSS tests failed.');
  console.error(error);
  process.exit(1);
});
