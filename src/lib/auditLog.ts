// Audit Log System
// In production, this should send logs to a backend service

export type AuditAction = 
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PAGE_VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'TRANSFER'
  | 'ASSIGN';

export type AuditCategory = 
  | 'AUTH'
  | 'NAVIGATION'
  | 'ASSET'
  | 'EMPLOYEE'
  | 'LOCATION'
  | 'CATEGORY'
  | 'VENDOR'
  | 'PROJECT'
  | 'PURCHASE_ORDER'
  | 'MAINTENANCE'
  | 'TRANSFER'
  | 'ASSIGNMENT';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  userEmail: string | null;
  action: AuditAction;
  category: AuditCategory;
  resource?: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

const AUDIT_LOG_KEY = 'audit_logs';
const MAX_LOGS = 500; // Keep last 500 entries in localStorage

// Generate unique ID
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Get current user from localStorage
const getCurrentUser = (): { id: string | null; email: string | null } => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return { id: user.id, email: user.email };
    }
  } catch {
    // Ignore parse errors
  }
  return { id: null, email: null };
};

// Create audit log entry
export const createAuditLog = (
  action: AuditAction,
  category: AuditCategory,
  options: {
    resource?: string;
    resourceId?: string;
    details?: string;
    status?: 'success' | 'failure';
    metadata?: Record<string, unknown>;
    userOverride?: { id: string; email: string };
  } = {}
): AuditLogEntry => {
  const user = options.userOverride || getCurrentUser();
  
  const entry: AuditLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    userId: user.id,
    userEmail: user.email,
    action,
    category,
    resource: options.resource,
    resourceId: options.resourceId,
    details: options.details,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    status: options.status || 'success',
    metadata: options.metadata,
  };

  // Store in localStorage
  saveAuditLog(entry);

  // In production, also send to backend
  // sendToBackend(entry);

  return entry;
};

// Save audit log to localStorage
const saveAuditLog = (entry: AuditLogEntry): void => {
  try {
    const logs = getAuditLogs();
    logs.unshift(entry); // Add to beginning
    
    // Keep only last MAX_LOGS entries
    const trimmedLogs = logs.slice(0, MAX_LOGS);
    
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(trimmedLogs));
  } catch (error) {
    console.error('Failed to save audit log:', error);
  }
};

// Get all audit logs
export const getAuditLogs = (): AuditLogEntry[] => {
  try {
    const logsStr = localStorage.getItem(AUDIT_LOG_KEY);
    if (logsStr) {
      return JSON.parse(logsStr);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
};

// Filter audit logs
export const filterAuditLogs = (filters: {
  action?: AuditAction;
  category?: AuditCategory;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'success' | 'failure';
}): AuditLogEntry[] => {
  let logs = getAuditLogs();

  if (filters.action) {
    logs = logs.filter(log => log.action === filters.action);
  }
  if (filters.category) {
    logs = logs.filter(log => log.category === filters.category);
  }
  if (filters.userId) {
    logs = logs.filter(log => log.userId === filters.userId);
  }
  if (filters.status) {
    logs = logs.filter(log => log.status === filters.status);
  }
  if (filters.startDate) {
    logs = logs.filter(log => new Date(log.timestamp) >= filters.startDate!);
  }
  if (filters.endDate) {
    logs = logs.filter(log => new Date(log.timestamp) <= filters.endDate!);
  }

  return logs;
};

// Clear all audit logs (admin only)
export const clearAuditLogs = (): void => {
  localStorage.removeItem(AUDIT_LOG_KEY);
};

// Export audit logs as JSON
export const exportAuditLogsAsJSON = (): string => {
  return JSON.stringify(getAuditLogs(), null, 2);
};

// Export audit logs as CSV
export const exportAuditLogsAsCSV = (): string => {
  const logs = getAuditLogs();
  const headers = ['Timestamp', 'User Email', 'Action', 'Category', 'Resource', 'Resource ID', 'Details', 'Status'];
  
  const rows = logs.map(log => [
    log.timestamp,
    log.userEmail || 'Anonymous',
    log.action,
    log.category,
    log.resource || '',
    log.resourceId || '',
    log.details || '',
    log.status,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
};

// Convenience functions for common actions
export const auditLog = {
  loginSuccess: (email: string) => 
    createAuditLog('LOGIN_SUCCESS', 'AUTH', { 
      details: `User logged in: ${email}`,
      userOverride: { id: 'pending', email }
    }),
  
  loginFailed: (email: string, reason?: string) => 
    createAuditLog('LOGIN_FAILED', 'AUTH', { 
      details: `Login failed for ${email}${reason ? `: ${reason}` : ''}`,
      status: 'failure',
      userOverride: { id: 'unknown', email }
    }),
  
  logout: () => 
    createAuditLog('LOGOUT', 'AUTH', { details: 'User logged out' }),
  
  pageView: (pageName: string, path: string) => 
    createAuditLog('PAGE_VIEW', 'NAVIGATION', { 
      resource: pageName, 
      details: `Viewed ${pageName}`,
      metadata: { path }
    }),
  
  create: (category: AuditCategory, resource: string, resourceId?: string) => 
    createAuditLog('CREATE', category, { resource, resourceId, details: `Created ${resource}` }),
  
  update: (category: AuditCategory, resource: string, resourceId?: string) => 
    createAuditLog('UPDATE', category, { resource, resourceId, details: `Updated ${resource}` }),
  
  delete: (category: AuditCategory, resource: string, resourceId?: string) => 
    createAuditLog('DELETE', category, { resource, resourceId, details: `Deleted ${resource}` }),
  
  export: (category: AuditCategory, resource: string, format: string) => 
    createAuditLog('EXPORT', category, { resource, details: `Exported ${resource} as ${format}` }),
};
