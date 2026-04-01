export function normalizeWhitespace(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSearchText(value: unknown) {
  return normalizeWhitespace(value).toLowerCase();
}
