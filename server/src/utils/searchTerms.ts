const DIACRITIC_REGEX = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const MAX_PREFIX_LENGTH = 24;

export function normalizeSearchValue(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(DIACRITIC_REGEX, '')
    .toLowerCase()
    .trim();
}

function tokenizeNormalizedValue(value: string) {
  return value
    .split(NON_ALPHANUMERIC_REGEX)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildSearchTerms(values: unknown[]) {
  const terms = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeSearchValue(value);
    if (!normalized) return;

    tokenizeNormalizedValue(normalized).forEach((token) => {
      const prefixLength = Math.min(token.length, MAX_PREFIX_LENGTH);
      for (let index = 1; index <= prefixLength; index += 1) {
        terms.add(token.slice(0, index));
      }
      if (token.length > MAX_PREFIX_LENGTH) {
        terms.add(token);
      }
    });
  });

  return Array.from(terms).sort();
}

export function buildSearchTermsQuery(search: unknown) {
  const normalized = normalizeSearchValue(search);
  if (!normalized) return null;

  const tokens = tokenizeNormalizedValue(normalized);
  if (tokens.length === 0) return null;

  return {
    search_terms: {
      $all: tokens,
    },
  };
}
