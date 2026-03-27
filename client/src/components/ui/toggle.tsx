/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Toggle = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof toggleVariants> & {
      pressed?: boolean;
      defaultPressed?: boolean;
      onPressedChange?: (pressed: boolean) => void;
    }
>(({ className, variant, size, pressed, defaultPressed = false, onPressedChange, onClick, ...props }, ref) => {
  const [internalPressed, setInternalPressed] = React.useState(defaultPressed);
  const isControlled = pressed !== undefined;
  const isPressed = isControlled ? pressed : internalPressed;

  const updatePressed = (nextPressed: boolean) => {
    if (!isControlled) {
      setInternalPressed(nextPressed);
    }
    onPressedChange?.(nextPressed);
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={isPressed}
      data-state={isPressed ? "on" : "off"}
      {...props}
      className={cn(toggleVariants({ variant, size, className }))}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || props.disabled) return;
        updatePressed(!isPressed);
      }}
    />
  );
});

Toggle.displayName = "Toggle";

export { Toggle, toggleVariants };
