import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectInjectedProps = {
  __options?: SelectOption[];
  __placeholder?: string;
  __value?: string;
  __onValueChange?: (value: string) => void;
  __disabled?: boolean;
};

function textContentFromNode(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textContentFromNode).join("");
  }

  if (React.isValidElement(node)) {
    return textContentFromNode(node.props.children);
  }

  return "";
}

function isPart(child: React.ReactNode, partName: string) {
  return React.isValidElement(child) && (child.type as { __selectPart?: string }).__selectPart === partName;
}

function extractPlaceholder(node: React.ReactNode): string | undefined {
  let placeholder: string | undefined;

  React.Children.forEach(node, (child) => {
    if (placeholder) return;
    if (!React.isValidElement(child)) return;

    if (isPart(child, "Value")) {
      placeholder = child.props.placeholder;
      return;
    }

    if (child.props.children) {
      placeholder = extractPlaceholder(child.props.children);
    }
  });

  return placeholder;
}

function extractOptions(node: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;

    if (isPart(child, "Item")) {
      options.push({
        value: child.props.value,
        label: textContentFromNode(child.props.children),
        disabled: child.props.disabled,
      });
      return;
    }

    if (child.props.children) {
      options.push(...extractOptions(child.props.children));
    }
  });

  return options;
}

const Select = ({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => {
  let triggerChild: React.ReactElement<any> | null = null;
  let placeholder: string | undefined;
  let options: SelectOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    if (isPart(child, "Trigger")) {
      triggerChild = child as React.ReactElement<any>;
      placeholder = extractPlaceholder(child.props.children);
      return;
    }

    if (isPart(child, "Content")) {
      options = extractOptions(child.props.children);
    }
  });

  if (!triggerChild) {
    return null;
  }

  return React.cloneElement(triggerChild, {
    __options: options,
    __placeholder: placeholder,
    __value: value ?? "",
    __onValueChange: onValueChange,
    __disabled: disabled,
  } satisfies SelectInjectedProps);
};

type SelectTriggerProps = React.SelectHTMLAttributes<HTMLSelectElement> &
  SelectInjectedProps & {
    children?: React.ReactNode;
  };

const SelectTrigger = React.forwardRef<HTMLSelectElement, SelectTriggerProps>(
  ({ className, __options = [], __placeholder, __value = "", __onValueChange, __disabled, onChange, ...props }, ref) => {
    const selectedLabel = __options.find((option) => option.value === __value)?.label;

    return (
    <div className="relative">
      <select
        ref={ref}
        value={__value}
        title={selectedLabel || __placeholder}
        disabled={__disabled || props.disabled}
        onChange={(event) => {
          onChange?.(event);
          if (!event.defaultPrevented) {
            __onValueChange?.(event.target.value);
          }
        }}
        className={cn(
          "flex min-h-11 w-full appearance-none rounded-xl border border-input/80 bg-white px-3.5 py-2 pr-10 text-sm leading-5 ring-offset-background transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive/55 aria-[invalid=true]:bg-destructive/[0.04]",
          className
        )}
        {...props}
      >
        {__placeholder ? (
          <option value="" disabled hidden>
            {__placeholder}
          </option>
        ) : null}
        {__options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}
);
SelectTrigger.displayName = "SelectTrigger";
(SelectTrigger as React.ComponentType<SelectTriggerProps> & { __selectPart?: string }).__selectPart = "Trigger";

const SelectValue = ({ placeholder: _placeholder }: { placeholder?: string }) => null;
(SelectValue as React.ComponentType<{ placeholder?: string }> & { __selectPart?: string }).__selectPart = "Value";

const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
(SelectContent as React.ComponentType<{ children: React.ReactNode }> & { __selectPart?: string }).__selectPart = "Content";

const SelectItem = ({
  children,
}: {
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
}) => <>{children}</>;
(SelectItem as React.ComponentType<{ value: string; disabled?: boolean; children: React.ReactNode }> & { __selectPart?: string }).__selectPart = "Item";

const SelectGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SelectLabel = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const SelectSeparator = () => null;
const SelectScrollUpButton = () => null;
const SelectScrollDownButton = () => null;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
