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
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="truncate text-left">{value || placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
                  <span className={option.primaryClassName}>{option.primaryText}</span>
                  {option.secondaryText ? (
                    <span className="ml-2 text-xs text-muted-foreground">{option.secondaryText}</span>
                  ) : null}
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
