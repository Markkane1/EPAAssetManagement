// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

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

function extractApiErrorMessage(errorText: string, status: number): string {
  if (!errorText) {
    return `HTTP error! status: ${status}`;
  }

  try {
    const parsed = JSON.parse(errorText) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const message = typeof parsed.message === 'string' ? parsed.message : '';
      const validationIssues = collectValidationIssues(parsed);
      const issueSummary = formatValidationIssueSummary(validationIssues);

      if (issueSummary && isValidationPayload(parsed, message)) {
        return issueSummary;
      }

      if (message) return message;
      if (issueSummary) return issueSummary;
    }
  } catch {
    // Ignore JSON parse failures and fall back to raw text.
  }

  return errorText;
}

// Generic API response handler
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(extractApiErrorMessage(error, response.status));
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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    cache: method === 'GET' ? 'no-store' : options.cache,
    headers,
    credentials: 'include',
  });
  
  return handleResponse<T>(response);
}

// Upload helper for multipart/form-data
async function uploadAPI<T>(endpoint: string, data: FormData, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): Promise<T> {
  const headers: HeadersInit = {};
  const csrfToken = getCookieValue('csrf_token');
  if (csrfToken) {
    (headers as Record<string, string>)['x-csrf-token'] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    body: data,
    headers,
    credentials: 'include',
  });

  return handleResponse<T>(response);
}

// Download helper for binary responses
async function downloadAPI(endpoint: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(extractApiErrorMessage(error, response.status));
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
