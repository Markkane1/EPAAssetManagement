import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type CommandContextValue = {
  query: string;
  setQuery: (query: string) => void;
  setItemMatch: (id: string, matches: boolean) => void;
  removeItemMatch: (id: string) => void;
  visibleItemCount: number;
};

const CommandContext = React.createContext<CommandContextValue | null>(null);

function useCommandContext() {
  const context = React.useContext(CommandContext);
  if (!context) {
    throw new Error("Command components must be used within <Command>");
  }
  return context;
}

const Command = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const [query, setQuery] = React.useState("");
    const [itemMatches, setItemMatches] = React.useState<Record<string, boolean>>({});

    const contextValue = React.useMemo<CommandContextValue>(
      () => ({
        query,
        setQuery,
        setItemMatch: (id, matches) => {
          setItemMatches((current) => {
            if (current[id] === matches) {
              return current;
            }
            return { ...current, [id]: matches };
          });
        },
        removeItemMatch: (id) => {
          setItemMatches((current) => {
            if (!(id in current)) {
              return current;
            }
            const next = { ...current };
            delete next[id];
            return next;
          });
        },
        visibleItemCount: Object.values(itemMatches).filter(Boolean).length,
      }),
      [itemMatches, query]
    );

    return (
      <CommandContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={cn(
            "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
            className
          )}
          {...props}
        />
      </CommandContext.Provider>
    );
  }
);
Command.displayName = "Command";

type CommandDialogProps = React.ComponentProps<typeof Dialog>;

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command className="[&_[data-command-group-heading]]:px-2 [&_[data-command-group-heading]]:font-medium [&_[data-command-group-heading]]:text-muted-foreground [&_[data-command-group]]:px-2 [&_[data-command-input-wrapper]_svg]:h-5 [&_[data-command-input-wrapper]_svg]:w-5 [&_[data-command-input]]:h-12 [&_[data-command-item]]:px-2 [&_[data-command-item]]:py-3 [&_[data-command-item]_svg]:h-5 [&_[data-command-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, onChange, ...props }, ref) => {
    const { query, setQuery } = useCommandContext();

    return (
      <div className="flex items-center border-b px-3" data-command-input-wrapper="">
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <input
          ref={ref}
          data-command-input=""
          className={cn(
            "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange?.(event);
          }}
          {...props}
        />
      </div>
    );
  }
);
CommandInput.displayName = "CommandInput";

const CommandList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
      {...props}
    />
  )
);
CommandList.displayName = "CommandList";

const CommandEmpty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { visibleItemCount } = useCommandContext();

    if (visibleItemCount > 0) {
      return null;
    }

    return <div ref={ref} className={cn("py-6 text-center text-sm", className)} {...props} />;
  }
);
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-command-group=""
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[data-command-group-heading]]:px-2 [&_[data-command-group-heading]]:py-1.5 [&_[data-command-group-heading]]:text-xs [&_[data-command-group-heading]]:font-medium [&_[data-command-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
);
CommandGroup.displayName = "CommandGroup";

const CommandSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("-mx-1 h-px bg-border", className)} {...props} />
  )
);
CommandSeparator.displayName = "CommandSeparator";

type CommandItemProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: string;
  onSelect?: (value: string) => void;
  disabled?: boolean;
};

const CommandItem = React.forwardRef<HTMLDivElement, CommandItemProps>(
  ({ className, value = "", onClick, onSelect, disabled = false, children, ...props }, ref) => {
    const { query, setItemMatch, removeItemMatch } = useCommandContext();
    const itemId = React.useId();
    const normalizedValue = value.toLowerCase();
    const normalizedQuery = query.trim().toLowerCase();
    const isVisible = !normalizedQuery || normalizedValue.includes(normalizedQuery);

    React.useEffect(() => {
      setItemMatch(itemId, isVisible);
      return () => removeItemMatch(itemId);
    }, [disabled, isVisible, itemId, removeItemMatch, setItemMatch]);

    if (!isVisible) {
      return null;
    }

    return (
      <div
        ref={ref}
        data-command-item=""
        data-disabled={disabled || undefined}
        className={cn(
          "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
          !disabled && "hover:bg-accent hover:text-accent-foreground",
          className
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !disabled) {
            onSelect?.(value);
          }
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CommandItem.displayName = "CommandItem";

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />
);
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
