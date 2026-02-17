import { useMemo, useState } from "react";

export type ViewMode = "grid" | "list";

const STORAGE_PREFIX = "ams.viewMode.";

function normalizeViewMode(value: string | null, fallback: ViewMode): ViewMode {
  if (value === "grid" || value === "list") return value;
  return fallback;
}

export function useViewMode(storageKey: string, fallback: ViewMode = "grid") {
  const persistedKey = useMemo(() => `${STORAGE_PREFIX}${storageKey}`, [storageKey]);
  const [mode, setModeState] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return fallback;
    return normalizeViewMode(window.localStorage.getItem(persistedKey), fallback);
  });

  const setMode = (nextMode: ViewMode) => {
    setModeState(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(persistedKey, nextMode);
    }
  };

  return { mode, setMode };
}

