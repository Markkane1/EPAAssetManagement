import type { ConsumableItem, Location } from "@/types";

export type ConsumableMode = "chemicals" | "general";

export const CONSUMABLE_MODE_STORAGE_KEY = "consumables.mode";

export function resolveChemicalsCapability(location: Location | null | undefined) {
  if (!location) return false;
  if (location.capabilities && typeof location.capabilities.chemicals === "boolean") {
    return location.capabilities.chemicals;
  }
  if (location.is_headoffice) return false;
  return location.type === "LAB";
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

export function filterLocationsByMode(locations: Location[], mode: ConsumableMode) {
  return locations.filter((location) => {
    if (mode === "chemicals") return resolveChemicalsCapability(location);
    return resolveConsumablesCapability(location);
  });
}
