import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ConsumableMode } from "@/lib/consumableMode";

interface ConsumableModeToggleProps {
  mode: ConsumableMode;
  onChange: (mode: ConsumableMode) => void;
}

export function ConsumableModeToggle({ mode, onChange }: ConsumableModeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      className="w-full justify-start sm:w-auto"
      onValueChange={(value) => {
        if (value) onChange(value as ConsumableMode);
      }}
    >
      <ToggleGroupItem value="chemicals" aria-label="Chemicals mode" className="flex-1 sm:flex-none">
        Chemicals
      </ToggleGroupItem>
      <ToggleGroupItem value="general" aria-label="General consumables mode" className="flex-1 sm:flex-none">
        General
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
