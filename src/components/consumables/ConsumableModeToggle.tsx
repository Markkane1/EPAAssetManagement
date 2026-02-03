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
      onValueChange={(value) => {
        if (value) onChange(value as ConsumableMode);
      }}
    >
      <ToggleGroupItem value="chemicals" aria-label="Chemicals mode">
        Chemicals
      </ToggleGroupItem>
      <ToggleGroupItem value="general" aria-label="General consumables mode">
        General
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
