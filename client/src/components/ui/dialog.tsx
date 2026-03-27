import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  callEventHandler,
  composeRefs,
  useBodyScrollLock,
  useControllableState,
} from "@/components/ui/layer-utils";

type DialogContextValue = {
  open: boolean;
  setOpen: (nextValue: boolean) => void;
  triggerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLDivElement>;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within <Dialog>");
  }
  return context;
}

type DialogProps = {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const Dialog = ({ children, open, defaultOpen, onOpenChange }: DialogProps) => {
  const [isOpen, setIsOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  return (
    <DialogContext.Provider
      value={{
        open: isOpen,
        setOpen: setIsOpen,
        triggerRef,
        contentRef,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
};

type TriggerProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
  children: React.ReactNode;
};

const DialogTrigger = React.forwardRef<HTMLElement, TriggerProps>(
  ({ asChild = false, children, onClick, ...props }, ref) => {
    const { setOpen, triggerRef } = useDialogContext();
    const mergedRef = composeRefs(triggerRef, ref);

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        ...children.props,
        ref: composeRefs(mergedRef, (children as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref),
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          callEventHandler(children.props.onClick, event);
          if (!event.defaultPrevented) {
            callEventHandler(onClick, event);
          }
          if (!event.defaultPrevented) {
            setOpen(true);
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
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
    );
  }
);
DialogTrigger.displayName = "DialogTrigger";

type CloseProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
  children?: React.ReactNode;
};

const DialogClose = React.forwardRef<HTMLElement, CloseProps>(
  ({ asChild = false, children, onClick, ...props }, ref) => {
    const { setOpen } = useDialogContext();

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        ...children.props,
        ref: composeRefs(ref, (children as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref),
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          callEventHandler(children.props.onClick, event);
          if (!event.defaultPrevented) {
            callEventHandler(onClick, event);
          }
          if (!event.defaultPrevented) {
            setOpen(false);
          }
        },
      });
    }

    return (
      <button
        type="button"
        {...props}
        ref={ref as React.Ref<HTMLButtonElement>}
        onClick={(event) => {
          callEventHandler(onClick, event);
          if (!event.defaultPrevented) {
            setOpen(false);
          }
        }}
      >
        {children}
      </button>
    );
  }
);
DialogClose.displayName = "DialogClose";

const DialogPortal = ({ children }: { children: React.ReactNode }) => {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
};

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { open } = useDialogContext();

    if (!open) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className
        )}
        data-state={open ? "open" : "closed"}
        {...props}
      />
    );
  }
);
DialogOverlay.displayName = "DialogOverlay";

type DialogContentProps = React.HTMLAttributes<HTMLDivElement> & {
  onInteractOutside?: (event: Event) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
};

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onInteractOutside, onPointerDownOutside, ...props }, ref) => {
    const { open, setOpen, contentRef } = useDialogContext();
    const mergedRef = composeRefs(contentRef, ref);

    useBodyScrollLock(open);

    React.useEffect(() => {
      if (!open) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, setOpen]);

    if (!open) return null;

    return (
      <DialogPortal>
        <DialogOverlay
          onPointerDown={(event) => {
            onPointerDownOutside?.(event.nativeEvent);
            onInteractOutside?.(event.nativeEvent);
          }}
        />
        <div
          ref={mergedRef}
          role="dialog"
          aria-modal="true"
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid max-h-[90vh] w-[calc(100%-1rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-background p-4 shadow-lg duration-200 data-[state=open]:animate-in sm:w-full sm:rounded-lg sm:p-6",
            className
          )}
          data-state="open"
          onPointerDown={(event) => event.stopPropagation()}
          {...props}
        >
          {children}
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
      </DialogPortal>
    );
  }
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
