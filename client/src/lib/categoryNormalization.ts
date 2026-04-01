import type { Category } from "@/types";

function normalizeEntry(value: unknown) {
  return String(value || "").trim();
}

export function normalizeSubcategories(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n\r]+/)
      : [];

  const seen = new Set<string>();
  return rawValues
    .map((entry) => normalizeEntry(entry))
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.localeCompare(right));
}

export function normalizeCategory<T extends Category>(category: T): T {
  return {
    ...category,
    scope: category.scope || "GENERAL",
    asset_type: category.asset_type || "ASSET",
    subcategories: normalizeSubcategories(category.subcategories),
  };
}

export function normalizeCategoryCollection<T extends Category>(categories: T[] | null | undefined): T[] {
  return (categories || []).map((category) => normalizeCategory(category));
}
