import { useEffect, useState } from "react";
import { CONSUMABLE_MODE_STORAGE_KEY, ConsumableMode } from "@/lib/consumableMode";

export function useConsumableMode(defaultMode: ConsumableMode = "chemicals") {
  const [mode, setMode] = useState<ConsumableMode>(() => {
    const saved = localStorage.getItem(CONSUMABLE_MODE_STORAGE_KEY);
    if (saved === "chemicals" || saved === "general") {
      return saved;
    }
    return defaultMode;
  });

  useEffect(() => {
    localStorage.setItem(CONSUMABLE_MODE_STORAGE_KEY, mode);
  }, [mode]);

  return {
    mode,
    setMode,
    isChemicals: mode === "chemicals",
  };
}
