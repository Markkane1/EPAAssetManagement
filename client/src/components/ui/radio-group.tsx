import * as React from "react";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

type RadioGroupContextValue = {
  value?: string;
  name?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

const RadioGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    name?: string;
    disabled?: boolean;
  }
>(({ className, value, defaultValue, onValueChange, name, disabled, children, ...props }, ref) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const resolvedValue = value !== undefined ? value : internalValue;

  const handleValueChange = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  };

  return (
    <RadioGroupContext.Provider
      value={{ value: resolvedValue, name, disabled, onValueChange: handleValueChange }}
    >
      <div ref={ref} className={cn("grid gap-2", className)} role="radiogroup" {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
});
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, onClick, disabled, type, ...props }, ref) => {
  const context = React.useContext(RadioGroupContext);
  const checked = context?.value === value;
  return (
    <button
      ref={ref}
      type={type || "button"}
      role="radio"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      {...props}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      disabled={disabled || context?.disabled}
      name={context?.name}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled || context?.disabled) return;
        context?.onValueChange?.(value);
      }}
    >
      <span className={cn("flex items-center justify-center", checked ? "opacity-100" : "opacity-0")}>
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </span>
    </button>
  );
});
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
