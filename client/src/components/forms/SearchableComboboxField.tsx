import { ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableComboboxOption {
  value: string;
  searchText: string;
  primaryText: string;
  secondaryText?: string;
  primaryClassName?: string;
}

interface SearchableComboboxFieldProps {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: string;
  options: SearchableComboboxOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  onValueChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function SearchableComboboxField({
  label,
  open,
  onOpenChange,
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  onValueChange,
  error,
  disabled = false,
}: SearchableComboboxFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            title={value || placeholder}
            className="min-h-11 h-auto w-full justify-between py-2 text-left whitespace-normal"
            disabled={disabled}
          >
            <span className="min-w-0 flex-1 break-words text-left leading-5 [overflow-wrap:anywhere]">{value || placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] max-w-[calc(100vw-1.5rem)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.searchText} ${option.value}`}
                  onSelect={() => {
                    onValueChange(option.value);
                    onOpenChange(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <span className={option.primaryClassName}>{option.primaryText}</span>
                    {option.secondaryText ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{option.secondaryText}</span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
