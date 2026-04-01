import { useMemo } from "react";

import type { Asset, AssetItem, Employee, Vendor } from "@/types";

import type { SearchableComboboxOption } from "@/components/forms/SearchableComboboxField";
import { normalizeSearchText, normalizeWhitespace } from "@/lib/textNormalization";

function useIdMap<T extends { id: string }>(items: T[]) {
  return useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
}

function normalizeAssetOptionKey(asset: Asset) {
  return [
    normalizeSearchText(asset.name),
    String(asset.category_id || "").trim(),
    normalizeSearchText(asset.subcategory),
  ].join("::");
}

export function useAssetNameMap(assets: Asset[]) {
  return useMemo(() => {
    return new Map(assets.map((asset) => [asset.id, asset.name || "Unknown"]));
  }, [assets]);
}

export function useAssetOptions(assets: Asset[]) {
  return useMemo<SearchableComboboxOption[]>(() => {
    const seen = new Set<string>();
    const options: SearchableComboboxOption[] = [];

    for (const asset of assets) {
      const optionKey = normalizeAssetOptionKey(asset);
      if (seen.has(optionKey)) continue;
      seen.add(optionKey);
      const primaryText = normalizeWhitespace(asset.name) || "Unknown";
      const secondaryText = normalizeWhitespace(asset.subcategory) || undefined;

      options.push({
        value: asset.id,
        searchText: `${primaryText} ${secondaryText || ""} ${normalizeWhitespace(asset.description)}`.trim(),
        primaryText,
        secondaryText,
      });
    }

    return options;
  }, [assets]);
}

export function useNamedEntityOptions<T extends { id: string; name: string }>(
  entities: T[],
  getSearchText?: (entity: T) => string,
) {
  return useMemo<SearchableComboboxOption[]>(() => {
    return entities.map((entity) => ({
      value: entity.id,
      searchText: getSearchText ? getSearchText(entity) : entity.name,
      primaryText: entity.name,
    }));
  }, [entities, getSearchText]);
}

export function useEmployeeOptions(employees: Employee[]) {
  return useMemo<SearchableComboboxOption[]>(() => {
    return employees.map((employee) => ({
      value: employee.id,
      searchText: `${employee.first_name} ${employee.last_name} ${employee.email}`.trim(),
      primaryText: `${employee.first_name} ${employee.last_name}`,
      secondaryText: employee.email,
      primaryClassName: "font-medium",
    }));
  }, [employees]);
}

export function useVendorOptions(vendors: Vendor[]) {
  return useMemo<SearchableComboboxOption[]>(() => {
    return vendors.map((vendor) => ({
      value: vendor.id,
      searchText: `${vendor.name || ""} ${vendor.email || ""} ${vendor.phone || ""}`.trim(),
      primaryText: vendor.name,
      secondaryText: vendor.phone || undefined,
    }));
  }, [vendors]);
}

export function useAssetItemOptions(assetItems: AssetItem[], assetNameById: Map<string, string>) {
  return useMemo<SearchableComboboxOption[]>(() => {
    return assetItems.map((item) => ({
      value: item.id,
      searchText: `${item.tag || ""} ${item.serial_number || ""} ${assetNameById.get(item.asset_id) || "Unknown"}`.trim(),
      primaryText: item.tag || item.serial_number || "Asset",
      secondaryText: assetNameById.get(item.asset_id) || "Unknown",
      primaryClassName: "font-mono",
    }));
  }, [assetItems, assetNameById]);
}

export function useEntityById<T extends { id: string }>(items: T[]) {
  const itemsById = useIdMap(items);

  return useMemo(() => {
    return (id?: string | null) => {
      if (!id) return undefined;
      return itemsById.get(id);
    };
  }, [itemsById]);
}
