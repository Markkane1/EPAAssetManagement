import { Router } from 'express';
import OPENAPI_SPEC from '../docs/openapi.generated';

const router = Router();

function toYaml(value: unknown, indent = 0): string {
  const spacing = '  '.repeat(indent);

  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    if (value.length === 0) return '""';
    if (/^[A-Za-z0-9_./{}:-]+$/.test(value)) return value;
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((entry) => {
        const serialized = toYaml(entry, indent + 1);
        if (serialized.includes('\n')) {
          return `${spacing}-\n${'  '.repeat(indent + 1)}${serialized.replace(/\n/g, `\n${'  '.repeat(indent + 1)}`)}`;
        }
        return `${spacing}- ${serialized}`;
      })
      .join('\n');
  }

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.length === 0) return '{}';

  return entries
    .map(([key, entry]) => {
      const serialized = toYaml(entry, indent + 1);
      const safeKey = /^[A-Za-z0-9_./{}:-]+$/.test(key) ? key : JSON.stringify(key);
      if (serialized.includes('\n')) {
        return `${spacing}${safeKey}:\n${'  '.repeat(indent + 1)}${serialized.replace(/\n/g, `\n${'  '.repeat(indent + 1)}`)}`;
      }
      return `${spacing}${safeKey}: ${serialized}`;
    })
    .join('\n');
}

router.get('/openapi.json', (_req, res) => {
  res.json(OPENAPI_SPEC);
});

router.get('/openapi.yaml', (_req, res) => {
  const yaml = toYaml(OPENAPI_SPEC);
  res.type('text/yaml').send(yaml);
});

router.get('/docs', (_req, res) => {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EPA AMS API Docs</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f8fafc; color: #0f172a; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .topbar { padding: 12px 16px; background: #0f172a; color: #f8fafc; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
      .topbar a { color: #93c5fd; text-decoration: none; margin-left: 12px; }
      .page { max-width: 1280px; margin: 0 auto; padding: 16px; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
      .card h4 { margin: 0 0 6px; font-size: 13px; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
      .card p { margin: 0; font-size: 22px; font-weight: 700; }
      .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
      input, select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; background: #fff; font-size: 14px; }
      input { min-width: 280px; flex: 1; }
      .tableWrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; border-bottom: 1px solid #f1f5f9; padding: 10px 12px; vertical-align: top; font-size: 13px; }
      thead th { position: sticky; top: 0; background: #f8fafc; z-index: 1; font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.02em; }
      .method { display: inline-block; min-width: 62px; text-align: center; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 700; color: #fff; }
      .m-get { background: #059669; }
      .m-post { background: #2563eb; }
      .m-put { background: #d97706; }
      .m-patch { background: #7c3aed; }
      .m-delete { background: #dc2626; }
      .path { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .muted { color: #64748b; }
      .footer { margin-top: 12px; font-size: 12px; color: #64748b; }
      .error { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
      @media (max-width: 1024px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="topbar">
      <strong>EPA AMS API Documentation</strong>
      <div>
        <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer">openapi.json</a>
        <a href="/api/openapi.yaml" target="_blank" rel="noopener noreferrer">openapi.yaml</a>
      </div>
    </div>
    <div class="page">
      <div id="error" class="error" style="display:none"></div>
      <div class="grid">
        <div class="card"><h4>API Title</h4><p id="apiTitle">-</p></div>
        <div class="card"><h4>Version</h4><p id="apiVersion">-</p></div>
        <div class="card"><h4>Total Paths</h4><p id="pathCount">-</p></div>
        <div class="card"><h4>Total Operations</h4><p id="opCount">-</p></div>
      </div>
      <div class="toolbar">
        <input id="search" placeholder="Search by path, method, tag, summary..." />
        <select id="method">
          <option value="">All methods</option>
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>PATCH</option>
          <option>DELETE</option>
        </select>
      </div>
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th style="width:100px">Method</th>
              <th style="width:360px">Path</th>
              <th style="width:160px">Tag</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div class="footer">This page is self-contained and does not depend on external CDNs.</div>
    </div>
    <script>
      (function () {
        const rowsEl = document.getElementById('rows');
        const errorEl = document.getElementById('error');
        const searchEl = document.getElementById('search');
        const methodEl = document.getElementById('method');
        const titleEl = document.getElementById('apiTitle');
        const versionEl = document.getElementById('apiVersion');
        const pathCountEl = document.getElementById('pathCount');
        const opCountEl = document.getElementById('opCount');
        let allRows = [];

        function methodClass(method) {
          const m = String(method || '').toLowerCase();
          return 'm-' + m;
        }

        function escapeHtml(value) {
          return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        }

        function render() {
          const term = String(searchEl.value || '').toLowerCase().trim();
          const method = String(methodEl.value || '').toUpperCase();
          const filtered = allRows.filter(function (row) {
            if (method && row.method !== method) return false;
            if (!term) return true;
            const haystack = [row.method, row.path, row.tag, row.summary].join(' ').toLowerCase();
            return haystack.indexOf(term) !== -1;
          });

          if (!filtered.length) {
            rowsEl.innerHTML = '<tr><td colspan="4" class="muted">No endpoints matched the current filter.</td></tr>';
            return;
          }

          rowsEl.innerHTML = filtered.map(function (row) {
            return '<tr>'
              + '<td><span class="method ' + methodClass(row.method) + '">' + escapeHtml(row.method) + '</span></td>'
              + '<td class="path">' + escapeHtml(row.path) + '</td>'
              + '<td>' + escapeHtml(row.tag) + '</td>'
              + '<td>' + escapeHtml(row.summary || '') + '</td>'
              + '</tr>';
          }).join('');
        }

        function setError(message) {
          errorEl.style.display = 'block';
          errorEl.textContent = message;
        }

        fetch('/api/openapi.json')
          .then(function (response) {
            if (!response.ok) throw new Error('Failed to load OpenAPI spec (' + response.status + ')');
            return response.json();
          })
          .then(function (spec) {
            titleEl.textContent = spec && spec.info && spec.info.title ? spec.info.title : '-';
            versionEl.textContent = spec && spec.info && spec.info.version ? spec.info.version : '-';
            const paths = spec && spec.paths ? spec.paths : {};
            const pathKeys = Object.keys(paths);
            pathCountEl.textContent = String(pathKeys.length);
            allRows = [];

            pathKeys.sort().forEach(function (pathname) {
              const methods = paths[pathname] || {};
              Object.keys(methods).forEach(function (methodKey) {
                const op = methods[methodKey] || {};
                allRows.push({
                  method: String(methodKey || '').toUpperCase(),
                  path: pathname,
                  tag: Array.isArray(op.tags) && op.tags.length ? op.tags[0] : '',
                  summary: op.summary || op.operationId || '',
                });
              });
            });

            allRows.sort(function (a, b) {
              return a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
            });
            opCountEl.textContent = String(allRows.length);
            render();
          })
          .catch(function (error) {
            setError(error && error.message ? error.message : 'Failed to load documentation.');
            rowsEl.innerHTML = '<tr><td colspan="4" class="muted">Unable to render endpoints.</td></tr>';
          });

        searchEl.addEventListener('input', render);
        methodEl.addEventListener('change', render);
      })();
    </script>
  </body>
</html>`;
  res.type('html').send(html);
});

export default router;
