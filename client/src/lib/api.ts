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

// Generic API response handler
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP error! status: ${response.status}`);
  }
  
  const text = await response.text();
  if (!text) return {} as T;
  
  return JSON.parse(text);
}

// Generic fetch wrapper with auth token support
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (isMutationMethod(options.method)) {
    const csrfToken = getCookieValue('csrf_token');
    if (csrfToken) {
      (headers as Record<string, string>)['x-csrf-token'] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
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
    throw new Error(error || `HTTP error! status: ${response.status}`);
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
