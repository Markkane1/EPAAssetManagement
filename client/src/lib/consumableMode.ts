import type { Category, ConsumableItem, Location } from "@/types";

export type ConsumableMode = "chemicals" | "general";

export const CONSUMABLE_MODE_STORAGE_KEY = "consumables.mode";

export function resolveChemicalsCapability(location: Location | null | undefined) {
  if (!location) return false;
  if (location.capabilities && typeof location.capabilities.chemicals === "boolean") {
    return location.capabilities.chemicals;
  }
  return location.type === "DISTRICT_LAB";
}

export function resolveConsumablesCapability(location: Location | null | undefined) {
  if (!location) return false;
  if (location.capabilities && typeof location.capabilities.consumables === "boolean") {
    return location.capabilities.consumables;
  }
  return true;
}

export function filterItemsByMode(items: ConsumableItem[], mode: ConsumableMode) {
  return items.filter((item) => {
    const isChemical = item.is_chemical === true;
    return mode === "chemicals" ? isChemical : !isChemical;
  });
}

function resolveCategoryScope(scope: Category["scope"]) {
  return scope === "LAB_ONLY" ? "LAB_ONLY" : "GENERAL";
}

export function filterConsumableCategoriesByMode(categories: Category[], mode: ConsumableMode) {
  return categories.filter((category) => {
    const scope = resolveCategoryScope(category.scope ?? null);
    return mode === "chemicals" ? scope === "LAB_ONLY" : scope === "GENERAL";
  });
}

export function filterLocationsByMode(locations: Location[], mode: ConsumableMode) {
  return locations.filter((location) => {
    if (mode === "chemicals") return resolveChemicalsCapability(location);
    return resolveConsumablesCapability(location);
  });
}
