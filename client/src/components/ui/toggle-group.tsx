import * as React from "react";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "default",
});

type ToggleGroupType = "single" | "multiple";

type ToggleGroupStateContext = VariantProps<typeof toggleVariants> & {
  type: ToggleGroupType;
  value: string | string[] | undefined;
  disabled?: boolean;
  setValue: (nextValue: string) => void;
};

const ToggleGroupValueContext = React.createContext<ToggleGroupStateContext | null>(null);

const ToggleGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof toggleVariants> & {
      type?: ToggleGroupType;
      value?: string | string[];
      defaultValue?: string | string[];
      onValueChange?: (value: string | string[]) => void;
      disabled?: boolean;
    }
>(({ className, variant, size, children, type = "single", value, defaultValue, onValueChange, disabled, ...props }, ref) => {
  const [internalValue, setInternalValue] = React.useState<string | string[] | undefined>(defaultValue);
  const currentValue = value !== undefined ? value : internalValue;

  const setValue = (nextValue: string) => {
    let resolvedValue: string | string[];
    if (type === "multiple") {
      const currentValues = Array.isArray(currentValue) ? currentValue : [];
      resolvedValue = currentValues.includes(nextValue)
        ? currentValues.filter((entry) => entry !== nextValue)
        : [...currentValues, nextValue];
    } else {
      resolvedValue = currentValue === nextValue ? "" : nextValue;
    }
    if (value === undefined) {
      setInternalValue(resolvedValue);
    }
    onValueChange?.(resolvedValue);
  };

  return (
    <div ref={ref} className={cn("flex items-center justify-center gap-1", className)} {...props}>
      <ToggleGroupContext.Provider value={{ variant, size }}>
        <ToggleGroupValueContext.Provider
          value={{ variant, size, type, value: currentValue, disabled, setValue }}
        >
          {children}
        </ToggleGroupValueContext.Provider>
      </ToggleGroupContext.Provider>
    </div>
  );
});

ToggleGroup.displayName = "ToggleGroup";

const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof toggleVariants> & {
      value: string;
    }
>(({ className, children, variant, size, value, onClick, disabled, type, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);
  const group = React.useContext(ToggleGroupValueContext);
  const isPressed = Array.isArray(group?.value)
    ? group.value.includes(value)
    : group?.value === value;

  return (
    <button
      ref={ref}
      type={type || "button"}
      aria-pressed={isPressed}
      data-state={isPressed ? "on" : "off"}
      {...props}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
      )}
      disabled={disabled || group?.disabled}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled || group?.disabled) return;
        group?.setValue(value);
      }}
    >
      {children}
    </button>
  );
});

ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem };
