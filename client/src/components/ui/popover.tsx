import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import {
  callEventHandler,
  composeRefs,
  type LayerAlign,
  useAnchoredPosition,
  useControllableState,
  useDismissableLayer,
} from "@/components/ui/layer-utils";

type PopoverContextValue = {
  open: boolean;
  setOpen: (nextValue: boolean) => void;
  triggerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLDivElement>;
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const context = React.useContext(PopoverContext);
  if (!context) {
    throw new Error("Popover components must be used within <Popover>");
  }
  return context;
}

const Popover = ({
  children,
  open,
  defaultOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) => {
  const [isOpen, setIsOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  return (
    <PopoverContext.Provider value={{ open: isOpen, setOpen: setIsOpen, triggerRef, contentRef }}>
      {children}
    </PopoverContext.Provider>
  );
};

const PopoverTrigger = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { asChild?: boolean }>(
  ({ asChild = false, children, onClick, ...props }, ref) => {
    const { open, setOpen, triggerRef } = usePopoverContext();
    const mergedRef = composeRefs(triggerRef, ref);

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      return React.cloneElement(child, {
        ...props,
        ...child.props,
        ref: composeRefs(mergedRef, child.ref),
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          callEventHandler(child.props.onClick, event);
          if (!event.defaultPrevented) {
            callEventHandler(onClick, event);
          }
          if (!event.defaultPrevented) {
            setOpen(!open);
          }
        },
      });
    }

    return (
      <button
        type="button"
        {...props}
        ref={mergedRef as React.Ref<HTMLButtonElement>}
        onClick={(event) => {
          callEventHandler(onClick, event);
          if (!event.defaultPrevented) {
            setOpen(!open);
          }
        }}
      >
        {children}
      </button>
    );
  }
);
PopoverTrigger.displayName = "PopoverTrigger";

type PopoverContentProps = React.HTMLAttributes<HTMLDivElement> & {
  align?: LayerAlign;
  sideOffset?: number;
};

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", sideOffset = 4, ...props }, ref) => {
    const { open, setOpen, triggerRef, contentRef } = usePopoverContext();
    const mergedRef = composeRefs(contentRef, ref);
    const style = useAnchoredPosition({
      open,
      triggerRef,
      contentRef,
      align,
      sideOffset,
    });

    useDismissableLayer({
      open,
      onDismiss: () => setOpen(false),
      contentRef,
      triggerRef,
    });

    if (!open || typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <div
        ref={mergedRef}
        className={cn(
          "z-50 w-auto min-w-[min(18rem,calc(100vw-1rem))] max-h-[min(24rem,calc(100vh-1rem))] max-w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden rounded-2xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-[0_20px_48px_-28px_rgba(26,28,24,0.18)] outline-none scrollbar-thin sm:p-4",
          className
        )}
        style={style}
        {...props}
      />,
      document.body
    );
  }
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent };
