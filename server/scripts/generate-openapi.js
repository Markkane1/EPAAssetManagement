const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const routesIndexPath = path.join(srcRoot, 'routes', 'index.ts');
const outputPath = path.join(srcRoot, 'docs', 'openapi.generated.ts');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function resolveImportPath(importPath) {
  const raw = importPath.replace(/\\/g, '/');
  const candidates = [
    path.resolve(path.join(srcRoot, 'routes'), raw),
    path.resolve(srcRoot, raw),
  ];

  for (const candidate of candidates) {
    const checks = [
      candidate,
      `${candidate}.ts`,
      `${candidate}.js`,
      path.join(candidate, 'index.ts'),
      path.join(candidate, 'index.js'),
    ];
    for (const check of checks) {
      if (fs.existsSync(check) && fs.statSync(check).isFile()) {
        return check;
      }
    }
  }

  return null;
}

function toOpenApiPath(routePath) {
  const withParams = routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const normalized = withParams.replace(/\/+/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function toTag(pathname) {
  const clean = pathname.replace(/^\/api\//, '');
  const segment = clean.split('/')[0] || 'root';
  const map = {
    auth: 'Auth',
    users: 'Users',
    activities: 'Activities',
    dashboard: 'Dashboard',
    settings: 'Settings',
    notifications: 'Notifications',
    categories: 'Categories',
    divisions: 'Divisions',
    districts: 'Districts',
    offices: 'Offices',
    'office-sub-locations': 'Office Sub Locations',
    vendors: 'Vendors',
    projects: 'Projects',
    schemes: 'Schemes',
    employees: 'Employees',
    assets: 'Assets',
    'asset-items': 'Asset Items',
    assignments: 'Assignments',
    maintenance: 'Maintenance',
    transfers: 'Transfers',
    'purchase-orders': 'Purchase Orders',
    consumables: 'Consumables',
    requisitions: 'Requisitions',
    'return-requests': 'Return Requests',
    reports: 'Reports',
    observability: 'Observability',
    records: 'Records',
    approvals: 'Approvals',
    documents: 'Documents',
    'document-links': 'Document Links',
    docs: 'Documentation',
    openapi: 'Documentation',
    health: 'Health',
    root: 'General',
  };
  return map[segment] || segment;
}

function buildOperationId(method, pathname) {
  const clean = pathname
    .replace(/^\/api\//, '')
    .replace(/[{}]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${method.toLowerCase()}_${clean || 'root'}`;
}

function extractMounts() {
  const routesIndex = readFile(routesIndexPath);
  const importMap = {};
  for (const match of routesIndex.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s+['"]([^'"]+)['"]/g)) {
    importMap[match[1]] = match[2];
  }

  const mounts = [];
  for (const match of routesIndex.matchAll(/router\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_]+)/g)) {
    const mountPath = match[1];
    const variable = match[2];
    const importPath = importMap[variable];
    if (!importPath) continue;
    const resolved = resolveImportPath(importPath);
    if (!resolved) continue;
    mounts.push({
      mountPath,
      file: resolved,
    });
  }

  return mounts;
}

function extractEndpoints() {
  const mounts = extractMounts();
  const endpoints = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2([\s\S]*?)\);/g;

  for (const mount of mounts) {
    const content = readFile(mount.file);
    const authAll = /router\.use\(\s*requireAuth\s*\)/.test(content);

    for (const match of content.matchAll(routeRegex)) {
      const method = match[1].toUpperCase();
      const subPath = match[3];
      const middlewares = match[4] || '';
      const fullPath = (`/api${mount.mountPath === '/' ? '' : mount.mountPath}${subPath}`).replace(/\/+/g, '/');
      const auth = authAll || /requireAuth/.test(middlewares);
      const singleUpload = middlewares.match(/upload\.single\(\s*['"`]([^'"`]+)['"`]\s*\)/);
      const hasUpload = /upload\.(single|fields)\(/.test(middlewares);

      endpoints.push({
        method,
        path: toOpenApiPath(fullPath),
        auth,
        hasUpload,
        uploadField: singleUpload ? singleUpload[1] : null,
      });
    }
  }

  endpoints.push({ method: 'GET', path: '/health', auth: false, hasUpload: false, uploadField: null });
  endpoints.push({ method: 'GET', path: '/api/openapi.json', auth: false, hasUpload: false, uploadField: null });
  endpoints.push({ method: 'GET', path: '/api/openapi.yaml', auth: false, hasUpload: false, uploadField: null });
  endpoints.push({ method: 'GET', path: '/api/docs', auth: false, hasUpload: false, uploadField: null });

  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return endpoints;
}

function buildOperation(endpoint) {
  const operation = {
    tags: [toTag(endpoint.path)],
    summary: `${endpoint.method} ${endpoint.path}`,
    operationId: buildOperationId(endpoint.method, endpoint.path),
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/GenericObject' },
          },
        },
      },
      '400': {
        description: 'Bad Request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      '500': {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  };

  if (endpoint.method === 'POST') {
    operation.responses['201'] = {
      description: 'Created',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GenericObject' },
        },
      },
    };
  }

  if (endpoint.method === 'DELETE') {
    operation.responses['204'] = { description: 'No Content' };
  }

  if (endpoint.auth) {
    operation.security = [{ bearerAuth: [] }, { cookieAuth: [] }];
    operation.responses['401'] = {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    };
    operation.responses['403'] = {
      description: 'Forbidden',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    };
  }

  const pathParams = [...endpoint.path.matchAll(/{([A-Za-z0-9_]+)}/g)].map((m) => m[1]);
  if (pathParams.length > 0) {
    operation.parameters = pathParams.map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: `${name} parameter`,
    }));
    operation.responses['404'] = {
      description: 'Not Found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    };
  }

  const supportsBody = endpoint.method === 'POST' || endpoint.method === 'PUT' || endpoint.method === 'PATCH';
  if (supportsBody) {
    if (endpoint.hasUpload) {
      const properties = {
        payload: { type: 'string', description: 'JSON payload string when using multipart uploads' },
      };
      if (endpoint.uploadField) {
        properties[endpoint.uploadField] = { type: 'string', format: 'binary' };
      } else {
        properties.file = { type: 'string', format: 'binary' };
      }
      operation.requestBody = {
        required: false,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties,
            },
          },
        },
      };
    } else {
      operation.requestBody = {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/GenericObject' },
          },
        },
      };
    }
  }

  return operation;
}

function buildSpec() {
  const endpoints = extractEndpoints();
  const paths = {};

  for (const endpoint of endpoints) {
    if (!paths[endpoint.path]) paths[endpoint.path] = {};
    const key = endpoint.method.toLowerCase();
    if (!paths[endpoint.path][key]) {
      paths[endpoint.path][key] = buildOperation(endpoint);
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'EPA AMS API',
      version: '1.0.0',
      description:
        'Comprehensive OpenAPI specification generated from the Express route registry. Includes auth, assets, consumables, requisitions, returns, records, reports, and administration APIs.',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local development server',
      },
    ],
    tags: [
      { name: 'Auth' },
      { name: 'Users' },
      { name: 'Activities' },
      { name: 'Dashboard' },
      { name: 'Settings' },
      { name: 'Notifications' },
      { name: 'Categories' },
      { name: 'Divisions' },
      { name: 'Districts' },
      { name: 'Offices' },
      { name: 'Office Sub Locations' },
      { name: 'Vendors' },
      { name: 'Projects' },
      { name: 'Schemes' },
      { name: 'Employees' },
      { name: 'Assets' },
      { name: 'Asset Items' },
      { name: 'Assignments' },
      { name: 'Maintenance' },
      { name: 'Transfers' },
      { name: 'Purchase Orders' },
      { name: 'Consumables' },
      { name: 'Requisitions' },
      { name: 'Return Requests' },
      { name: 'Records' },
      { name: 'Approvals' },
      { name: 'Documents' },
      { name: 'Document Links' },
      { name: 'Reports' },
      { name: 'Observability' },
      { name: 'Documentation' },
      { name: 'Health' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT bearer token via Authorization header',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'auth_token',
          description: 'JWT auth cookie set by login endpoint',
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-csrf-token',
          description: 'CSRF token header required for protected mutation routes',
        },
      },
      schemas: {
        GenericObject: {
          type: 'object',
          additionalProperties: true,
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object', additionalProperties: true },
          },
          additionalProperties: true,
        },
      },
    },
    paths,
  };
}

function main() {
  const spec = buildSpec();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const body = `/* AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.\n * Run: node scripts/generate-openapi.js\n */\n\nexport const OPENAPI_SPEC = ${JSON.stringify(spec, null, 2)} as const;\n\nexport default OPENAPI_SPEC;\n`;
  fs.writeFileSync(outputPath, body, 'utf8');
  const totalEndpoints = Object.values(spec.paths).reduce((sum, methods) => sum + Object.keys(methods).length, 0);
  console.log(`Generated OpenAPI specification with ${totalEndpoints} operations at ${outputPath}`);
}

main();

