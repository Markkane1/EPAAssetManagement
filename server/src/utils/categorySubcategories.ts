import { createHttpError } from './httpError';

export function sanitizeHierarchyText(value: string) {
  return value
    .replace(/on[a-z]+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSubcategories(value: unknown) {
  if (value === undefined) return undefined;

  const rawEntries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : null;

  if (!rawEntries) {
    throw createHttpError(400, 'subcategories must be an array of strings');
  }

  const normalized = rawEntries
    .map((entry) => sanitizeHierarchyText(String(entry || '')))
    .filter(Boolean);

  const unique = Array.from(new Set(normalized));
  const invalid = unique.find((entry) => entry.length > 100);
  if (invalid) {
    throw createHttpError(400, 'subcategory names must be 100 characters or fewer');
  }

  return unique;
}

export function parseOptionalSubcategory(value: unknown) {
  if (value === undefined) return undefined;
  const normalized = sanitizeHierarchyText(String(value || ''));
  if (!normalized) return null;
  if (normalized.length > 100) {
    throw createHttpError(400, 'subcategory must be 100 characters or fewer');
  }
  return normalized;
}
