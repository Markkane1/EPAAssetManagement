import * as React from "react";

import { cn } from "@/lib/utils";

type TooltipContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const Tooltip = ({
  children,
}: {
  children: React.ReactNode;
  delayDuration?: number;
}) => {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <span className="relative inline-flex">{children}</span>
    </TooltipContext.Provider>
  );
};

const TooltipTrigger = ({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) => {
  const context = React.useContext(TooltipContext);

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onMouseEnter?: (event: React.MouseEvent) => void;
      onMouseLeave?: (event: React.MouseEvent) => void;
      onFocus?: (event: React.FocusEvent) => void;
      onBlur?: (event: React.FocusEvent) => void;
    }>;
    return React.cloneElement(children, {
      onMouseEnter: (event: React.MouseEvent) => {
        child.props.onMouseEnter?.(event);
        context?.setOpen(true);
      },
      onMouseLeave: (event: React.MouseEvent) => {
        child.props.onMouseLeave?.(event);
        context?.setOpen(false);
      },
      onFocus: (event: React.FocusEvent) => {
        child.props.onFocus?.(event);
        context?.setOpen(true);
      },
      onBlur: (event: React.FocusEvent) => {
        child.props.onBlur?.(event);
        context?.setOpen(false);
      },
    });
  }

  return (
    <span
      onMouseEnter={() => context?.setOpen(true)}
      onMouseLeave={() => context?.setOpen(false)}
      onFocus={() => context?.setOpen(true)}
      onBlur={() => context?.setOpen(false)}
    >
      {children}
    </span>
  );
};

const TooltipContent = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    side?: "top" | "right" | "bottom" | "left";
    sideOffset?: number;
  }
>(({ className, side = "top", sideOffset = 4, style, ...props }, ref) => {
  const context = React.useContext(TooltipContext);

  if (!context?.open) return null;

  const sideStyles: Record<string, React.CSSProperties> = {
    top: { bottom: `calc(100% + ${sideOffset}px)`, left: "50%", transform: "translateX(-50%)" },
    right: { left: `calc(100% + ${sideOffset}px)`, top: "50%", transform: "translateY(-50%)" },
    bottom: { top: `calc(100% + ${sideOffset}px)`, left: "50%", transform: "translateX(-50%)" },
    left: { right: `calc(100% + ${sideOffset}px)`, top: "50%", transform: "translateY(-50%)" },
  };

  return (
    <span
      ref={ref}
      className={cn(
        "absolute z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
        className
      )}
      style={{ ...sideStyles[side], ...style }}
      {...props}
    />
  );
});
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
