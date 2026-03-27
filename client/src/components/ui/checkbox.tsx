import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

type CheckedState = boolean | "indeterminate";

const Checkbox = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
    checked?: CheckedState;
    defaultChecked?: CheckedState;
    onCheckedChange?: (checked: CheckedState) => void;
  }
>(({ className, checked, defaultChecked = false, onCheckedChange, onClick, disabled, type, ...props }, ref) => {
  const [internalChecked, setInternalChecked] = React.useState<CheckedState>(defaultChecked);
  const isControlled = checked !== undefined;
  const resolvedChecked = isControlled ? checked : internalChecked;

  const updateChecked = (nextChecked: CheckedState) => {
    if (!isControlled) {
      setInternalChecked(nextChecked);
    }
    onCheckedChange?.(nextChecked);
  };

  return (
    <button
      ref={ref}
      type={type || "button"}
      role="checkbox"
      aria-checked={resolvedChecked === "indeterminate" ? "mixed" : resolvedChecked}
      data-state={resolvedChecked === "indeterminate" ? "indeterminate" : resolvedChecked ? "checked" : "unchecked"}
      disabled={disabled}
      {...props}
      className={cn(
        "peer flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        resolvedChecked ? "bg-primary text-primary-foreground" : "bg-background text-transparent",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) return;
        updateChecked(resolvedChecked === true ? false : true);
      }}
    >
      {resolvedChecked === "indeterminate" ? <Minus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
    </button>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
