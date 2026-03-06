import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { cleanupSecurityContext, login, seedSecurityData } from './_helpers';

function writeTempFile(name: string, content: string | Buffer) {
  const filePath = path.join(os.tmpdir(), `ams-security-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

async function main() {
  const ctx = await seedSecurityData();
  const tempFiles: string[] = [];
  try {
    const employeeAAgent = request.agent(ctx.app);
    const employeeBAgent = request.agent(ctx.app);
    await login(employeeAAgent, ctx.users.employeeA.email, ctx.password);
    await login(employeeBAgent, ctx.users.employeeB.email, ctx.password);

    const docRes = await employeeAAgent.post('/api/documents').send({
      title: 'Upload Security Doc',
      docType: 'Invoice',
      officeId: ctx.offices.officeA.id,
    });
    assert.equal(docRes.status, 201, 'Document create must succeed');

    const validPdf = writeTempFile('valid.pdf', '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    tempFiles.push(validPdf);
    const validUpload = await employeeAAgent
      .post(`/api/documents/${docRes.body.id}/upload`)
      .attach('file', validPdf, { filename: 'valid.pdf', contentType: 'application/pdf' });
    assert.equal(validUpload.status, 201, 'Valid PDF upload must succeed');

    const disguisedJs = writeTempFile('image.jpg', 'console.log("owned");');
    tempFiles.push(disguisedJs);
    const disguisedJsRes = await employeeAAgent
      .post(`/api/documents/${docRes.body.id}/upload`)
      .attach('file', disguisedJs, { filename: 'image.jpg', contentType: 'image/jpeg' });
    assert.equal(disguisedJsRes.status, 400, 'Disguised script renamed to .jpg must be rejected');

    const disguisedHtml = writeTempFile('document.pdf', '<html><script>alert(1)</script></html>');
    tempFiles.push(disguisedHtml);
    const disguisedHtmlRes = await employeeAAgent
      .post(`/api/documents/${docRes.body.id}/upload`)
      .attach('file', disguisedHtml, { filename: 'document.pdf', contentType: 'application/pdf' });
    assert.equal(disguisedHtmlRes.status, 400, 'HTML content renamed to .pdf must be rejected');

    const doubleExtension = writeTempFile('malware.jpg.exe', 'MZ-bad');
    tempFiles.push(doubleExtension);
    const doubleExtensionRes = await employeeAAgent
      .post(`/api/documents/${docRes.body.id}/upload`)
      .attach('file', doubleExtension, { filename: 'malware.jpg.exe', contentType: 'image/jpeg' });
    assert.equal(doubleExtensionRes.status, 400, 'Double extension upload must be rejected');

    const noExtension = writeTempFile('noext', 'not-valid');
    tempFiles.push(noExtension);
    const noExtensionRes = await employeeAAgent
      .post(`/api/documents/${docRes.body.id}/upload`)
      .attach('file', noExtension, { filename: 'noext', contentType: 'application/pdf' });
    assert.equal(noExtensionRes.status, 400, 'Missing extension upload must be rejected');

    const traversalName = writeTempFile('traversal.pdf', '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    tempFiles.push(traversalName);
    const traversalRes = await employeeAAgent
      .post(`/api/documents/${docRes.body.id}/upload`)
      .attach('file', traversalName, { filename: '../../etc/passwd.pdf', contentType: 'application/pdf' });
    assert.equal(traversalRes.status, 201, 'Traversal-style filename is normalized into storage path');
    assert.equal(String(traversalRes.body.file_path || '').includes('..'), false, 'Stored file path must not contain traversal segments');

    const oversized = writeTempFile('oversized.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 'a')]));
    tempFiles.push(oversized);
    const oversizedRes = await employeeAAgent
      .post(`/api/documents/${docRes.body.id}/upload`)
      .attach('file', oversized, { filename: 'oversized.pdf', contentType: 'application/pdf' });
    assert.equal(oversizedRes.status, 413, 'Oversized upload must be rejected with 413');

    const blockedExts = ['bad.js', 'bad.sh', 'bad.php', 'bad.py', 'bad.exe'];
    for (const name of blockedExts) {
      const filePath = writeTempFile(name, 'echo owned');
      tempFiles.push(filePath);
      const res = await employeeAAgent
        .post(`/api/documents/${docRes.body.id}/upload`)
        .attach('file', filePath, { filename: name, contentType: 'application/pdf' });
      assert.equal(res.status, 400, `Executable extension ${name} must be rejected by upload filter`);
    }

    const crossUserDownload = await employeeBAgent.get(`/api/documents/versions/${validUpload.body.id}/download`);
    assert.equal(crossUserDownload.status, 403, 'Cross-office user must not access another office document version');

    console.log('File upload security tests passed.');
  } finally {
    for (const filePath of tempFiles) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    await cleanupSecurityContext(ctx);
  }
}

main().catch((error) => {
  console.error('File upload security tests failed.');
  console.error(error);
  process.exit(1);
});

