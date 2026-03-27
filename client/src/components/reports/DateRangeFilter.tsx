import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

interface DateRangeFilterProps {
  startDate?: Date;
  endDate?: Date;
  onStartDateChange: (date?: Date) => void;
  onEndDateChange: (date?: Date) => void;
  onClear?: () => void;
  rangeText: string;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  rangeText,
}: DateRangeFilterProps) {
  const formatDateValue = (value?: Date) => (value ? format(value, "yyyy-MM-dd") : "");
  const parseDateValue = (value: string) => {
    if (!value) return undefined;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Date Range Filter:</span>
          </div>

          <div className="w-full sm:w-[180px]">
            <Input
              type="date"
              value={formatDateValue(startDate)}
              onChange={(event) => onStartDateChange(parseDateValue(event.target.value))}
              aria-label="Start date"
              className={cn(!startDate && "text-muted-foreground")}
            />
          </div>

          <span className="hidden text-muted-foreground sm:inline">to</span>

          <div className="w-full sm:w-[180px]">
            <Input
              type="date"
              value={formatDateValue(endDate)}
              onChange={(event) => onEndDateChange(parseDateValue(event.target.value))}
              aria-label="End date"
              className={cn(!endDate && "text-muted-foreground")}
            />
          </div>

          {(startDate || endDate) && onClear && (
            <Button variant="ghost" size="sm" onClick={onClear} className="w-full sm:w-auto">
              Clear
            </Button>
          )}

          <div className="text-sm text-muted-foreground sm:ml-auto">
            Showing: <span className="font-medium text-foreground">{rangeText}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
