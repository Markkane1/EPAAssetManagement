import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutGrid, List } from "lucide-react";
import type { ViewMode } from "@/hooks/useViewMode";

interface ViewModeToggleProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ mode, onModeChange }: ViewModeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      className="w-full justify-start sm:w-auto"
      onValueChange={(value) => {
        if (!value) return;
        onModeChange(value as ViewMode);
      }}
    >
      <ToggleGroupItem value="grid" aria-label="Grid view" className="flex-1 sm:flex-none">
        <LayoutGrid className="h-4 w-4 mr-2" />
        Grid
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List view" className="flex-1 sm:flex-none">
        <List className="h-4 w-4 mr-2" />
        List
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
