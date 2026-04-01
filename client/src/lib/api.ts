// API Configuration
function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizeHostname(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '[::1]') return '::1';
  return normalized;
}

function isLoopbackHostname(value: string) {
  const normalized = normalizeHostname(value);
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

type LocationLike = Pick<Location, 'hostname' | 'protocol'>;

function shouldUseConfiguredApiBaseUrl(configured: string, locationLike?: LocationLike) {
  if (!configured) return false;
  if (!/^https?:\/\//i.test(configured)) return true;

  try {
    const targetUrl = new URL(configured);
    if (!locationLike) {
      return true;
    }

    const appHost = normalizeHostname(locationLike.hostname);
    const apiHost = normalizeHostname(targetUrl.hostname);

    if (locationLike.protocol === 'https:' && targetUrl.protocol !== 'https:') {
      return false;
    }

    if (isLoopbackHostname(apiHost) && !isLoopbackHostname(appHost)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(
  locationLike: LocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined,
  configuredOverride?: string
) {
  const configured = String(configuredOverride ?? (import.meta.env.VITE_API_BASE_URL || '')).trim();
  if (configured && shouldUseConfiguredApiBaseUrl(configured, locationLike)) {
    return trimTrailingSlash(configured);
  }
  return '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '') || '';

export function buildApiUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  payload?: Record<string, unknown> | null;

  constructor(message: string, status: number, details?: unknown, payload?: Record<string, unknown> | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.payload = payload || null;
  }
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const encodedName = `${encodeURIComponent(name)}=`;
  const entries = document.cookie ? document.cookie.split('; ') : [];
  for (const entry of entries) {
    if (entry.startsWith(encodedName)) {
      return decodeURIComponent(entry.slice(encodedName.length));
    }
  }
  return null;
}

function isMutationMethod(method?: string) {
  const normalized = (method || 'GET').toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}

function normalizeMongoIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMongoIds(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;

  // Handle Mongo Extended JSON ObjectId shape: { "$oid": "..." }.
  if (
    typeof record.$oid === 'string' &&
    Object.keys(record).length === 1
  ) {
    return record.$oid;
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = normalizeMongoIds(entry);
  }

  if (normalized.id === undefined && normalized._id !== undefined) {
    normalized.id = normalized._id;
  }

  return normalized;
}

function isGenericValidationMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === 'validation error' ||
    normalized === 'validation failed' ||
    normalized === 'invalid payload' ||
    normalized === 'invalid request payload'
  );
}

function collectValidationIssues(payload: Record<string, unknown>): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (value: string) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    collected.push(normalized);
  };

  const issues = payload.issues;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      if (!issue || typeof issue !== 'object') continue;
      const issueRecord = issue as Record<string, unknown>;
      const path = typeof issueRecord.path === 'string' ? issueRecord.path : '';
      const message = typeof issueRecord.message === 'string' ? issueRecord.message : '';
      if (message) {
        pushUnique(path && path !== '_root' ? `${path}: ${message}` : message);
      }
    }
  }

  const errors = payload.errors;
  if (errors && typeof errors === 'object') {
    const errorMap = errors as Record<string, unknown>;
    for (const [field, fieldErrors] of Object.entries(errorMap)) {
      if (!Array.isArray(fieldErrors) || fieldErrors.length === 0) continue;
      for (const entry of fieldErrors) {
        if (typeof entry !== 'string' || entry.trim().length === 0) continue;
        pushUnique(field && field !== '_root' ? `${field}: ${entry}` : entry);
      }
    }
  }

  return collected;
}

function isValidationPayload(payload: Record<string, unknown>, message: string) {
  return payload.error === 'VALIDATION_ERROR' || isGenericValidationMessage(message);
}

function formatValidationIssueSummary(issues: string[]) {
  if (issues.length === 0) return '';
  if (issues.length === 1) return issues[0];
  const maxIssues = 6;
  const visible = issues.slice(0, maxIssues);
  const suffix = issues.length > maxIssues ? ` (+${issues.length - maxIssues} more)` : '';
  return visible.join(' | ') + suffix;
}

function extractApiErrorPayload(errorText: string, status: number): {
  message: string;
  details?: unknown;
  payload?: Record<string, unknown> | null;
} {
  if (!errorText) {
    return { message: `HTTP error! status: ${status}` };
  }

  try {
    const parsed = JSON.parse(errorText) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const message = typeof parsed.message === 'string' ? parsed.message : '';
      const validationIssues = collectValidationIssues(parsed);
      const issueSummary = formatValidationIssueSummary(validationIssues);

      if (issueSummary && isValidationPayload(parsed, message)) {
        return { message: issueSummary, details: parsed.details, payload: parsed };
      }

      if (message) return { message, details: parsed.details, payload: parsed };
      if (issueSummary) return { message: issueSummary, details: parsed.details, payload: parsed };
    }
  } catch {
    // Ignore JSON parse failures and fall back to raw text.
  }

  return { message: errorText };
}

function describeApiTarget(requestUrl: string) {
  if (/^https?:\/\//i.test(requestUrl)) {
    return requestUrl;
  }
  return API_BASE_URL || '/api';
}

function wrapNetworkError(requestUrl: string, error: unknown) {
  return new ApiError(
    `Unable to reach the API server (${describeApiTarget(requestUrl)}). Check the API URL and server availability.`,
    0,
    error
  );
}

// Generic API response handler
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    const parsed = extractApiErrorPayload(errorText, response.status);
    throw new ApiError(parsed.message, response.status, parsed.details, parsed.payload || null);
  }
  
  const text = await response.text();
  if (!text) return {} as T;

  const parsed = JSON.parse(text);
  return normalizeMongoIds(parsed) as T;
}

// Generic fetch wrapper with auth token support
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (isMutationMethod(method)) {
    const csrfToken = getCookieValue('csrf_token');
    if (csrfToken) {
      (headers as Record<string, string>)['x-csrf-token'] = csrfToken;
    }
  }

  const requestUrl = `${API_BASE_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    throw wrapNetworkError(requestUrl, error);
  }
  
  return handleResponse<T>(response);
}

// Upload helper for multipart/form-data
async function uploadAPI<T>(endpoint: string, data: FormData, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<T> {
  const headers: HeadersInit = {};
  const csrfToken = getCookieValue('csrf_token');
  if (csrfToken) {
    (headers as Record<string, string>)['x-csrf-token'] = csrfToken;
  }

  const requestUrl = `${API_BASE_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method,
      body: data,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    throw wrapNetworkError(requestUrl, error);
  }

  return handleResponse<T>(response);
}

// Download helper for binary responses
async function downloadAPI(endpoint: string): Promise<Blob> {
  const requestUrl = `${API_BASE_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      credentials: 'include',
    });
  } catch (error) {
    throw wrapNetworkError(requestUrl, error);
  }
  if (!response.ok) {
    const error = await response.text();
    throw new Error(extractApiErrorPayload(error, response.status).message);
  }
  return response.blob();
}

// API methods
export const api = {
  // GET request
  get: <T>(endpoint: string) => fetchAPI<T>(endpoint, { method: 'GET' }),
  
  // POST request
  post: <T>(endpoint: string, data?: unknown) =>
    fetchAPI<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  
  // PUT request
  put: <T>(endpoint: string, data?: unknown) =>
    fetchAPI<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),
  
  // DELETE request
  delete: <T>(endpoint: string) => fetchAPI<T>(endpoint, { method: 'DELETE' }),

  // Upload multipart/form-data
  upload: <T>(endpoint: string, data: FormData, method?: 'POST' | 'PUT' | 'PATCH') =>
    uploadAPI<T>(endpoint, data, method),

  // Download binary payload
  download: (endpoint: string) => downloadAPI(endpoint),
};

export default api;
