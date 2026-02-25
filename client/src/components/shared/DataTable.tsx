import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";
import { ReactNode, isValidElement, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usePageSearch as usePageSearchContext } from "@/contexts/PageSearchContext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  filterable?: boolean;
  exportable?: boolean;
  exportFileName?: string;
  searchPlaceholder?: string;
  useGlobalPageSearch?: boolean;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => React.ReactNode;
  virtualized?: boolean;
  virtualRowHeight?: number;
  virtualViewportHeight?: number;
}

type FilterOperator = "contains" | "equals" | "date_from" | "date_to";

interface DataTableFilter {
  id: string;
  columnKey: string;
  operator: FilterOperator;
  value: string;
}

function renderCellValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (isValidElement(value)) {
    return value;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function appendSearchTokens(value: unknown, tokens: string[], visited: WeakSet<object>) {
  if (value === null || value === undefined) return;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    tokens.push(String(value).toLowerCase());
    return;
  }

  if (value instanceof Date) {
    tokens.push(value.toISOString().toLowerCase());
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => appendSearchTokens(entry, tokens, visited));
    return;
  }

  if (typeof value === "object") {
    if (visited.has(value)) return;
    visited.add(value);
    Object.values(value as Record<string, unknown>).forEach((entry) => {
      appendSearchTokens(entry, tokens, visited);
    });
  }
}

function getValueByKey<T>(row: T, key: string): unknown {
  return key.split(".").reduce<unknown>((obj, k) => {
    if (obj && typeof obj === "object" && k in obj) {
      return (obj as Record<string, unknown>)[k];
    }
    return undefined;
  }, row);
}

function stringifyFilterValue(value: unknown): string {
  const tokens: string[] = [];
  appendSearchTokens(value, tokens, new WeakSet<object>());
  return tokens.join(" ").trim().toLowerCase();
}

function toDateTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const dateValue = value instanceof Date ? value : new Date(String(value));
  const timestamp = dateValue.getTime();
  if (Number.isNaN(timestamp)) return null;
  return timestamp;
}

function formatExportValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const normalized = formatExportValue(entry);
        return normalized === null || normalized === undefined ? "" : String(normalized);
      })
      .join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeCsvCell(value: unknown): string {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function sanitizeFileName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "table-export";
}

export function DataTable<T extends { id?: string; _id?: string }>({
  columns,
  data,
  searchable = true,
  filterable = true,
  exportable = true,
  exportFileName = "table-export",
  searchPlaceholder = "Search...",
  useGlobalPageSearch = true,
  onRowClick,
  actions,
  virtualized = false,
  virtualRowHeight = 52,
  virtualViewportHeight = 560,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const pageSearch = usePageSearchContext();
  const [filters, setFilters] = useState<DataTableFilter[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const useVirtualizedTable = virtualized && !isMobile;
  const availableFilterColumns = useMemo(
    () => columns.filter((column) => Boolean(column.key)),
    [columns]
  );

  const effectiveSearch = useGlobalPageSearch && pageSearch ? pageSearch.term : search;
  const activeFilters = useMemo(
    () =>
      filters.filter(
        (filter) => filter.columnKey && filter.value.trim().length > 0
      ),
    [filters]
  );
  const activeFilterSignature = useMemo(
    () =>
      activeFilters
        .map((filter) => `${filter.columnKey}:${filter.operator}:${filter.value.trim().toLowerCase()}`)
        .join("|"),
    [activeFilters]
  );

  useEffect(() => {
    setPage(1);
  }, [effectiveSearch, activeFilterSignature]);

  useEffect(() => {
    setVirtualScrollTop(0);
  }, [page, pageSize, effectiveSearch, data.length, useVirtualizedTable, activeFilterSignature]);

  const normalizedSearch = effectiveSearch.trim().toLowerCase();

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (normalizedSearch) {
        const tokens: string[] = [];
        appendSearchTokens(row, tokens, new WeakSet<object>());
        const matchesSearch = tokens.some((token) => token.includes(normalizedSearch));
        if (!matchesSearch) return false;
      }

      if (activeFilters.length === 0) return true;

      return activeFilters.every((filter) => {
        const rawValue = getValueByKey(row, filter.columnKey);
        const filterValue = filter.value.trim();
        if (!filterValue) return true;
        if (filter.operator === "date_from" || filter.operator === "date_to") {
          const rowTimestamp = toDateTimestamp(rawValue);
          const filterTimestamp = toDateTimestamp(filterValue);
          if (rowTimestamp === null || filterTimestamp === null) return false;
          if (filter.operator === "date_from") return rowTimestamp >= filterTimestamp;
          return rowTimestamp <= filterTimestamp;
        }
        const value = stringifyFilterValue(rawValue);
        const normalizedFilterValue = filterValue.toLowerCase();
        if (filter.operator === "equals") {
          return value === normalizedFilterValue;
        }
        return value.includes(normalizedFilterValue);
      });
    });
  }, [activeFilters, data, normalizedSearch]);

  const exportRows = useMemo(
    () =>
      filteredData.map((row) =>
        columns.reduce<Record<string, string | number | boolean | null>>((acc, column) => {
          acc[column.label] = formatExportValue(getValueByKey(row, column.key));
          return acc;
        }, {})
      ),
    [columns, filteredData]
  );

  const resolvedExportFileName = useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    return `${sanitizeFileName(exportFileName)}-${date}`;
  }, [exportFileName]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * pageSize, page * pageSize),
    [filteredData, page, pageSize]
  );
  const virtualOverscan = 6;
  const virtualWindow = useMemo(() => {
    if (!useVirtualizedTable) {
      return {
        visibleRows: paginatedData,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }

    const totalRows = paginatedData.length;
    const startIndex = Math.max(0, Math.floor(virtualScrollTop / virtualRowHeight) - virtualOverscan);
    const visibleCount = Math.ceil(virtualViewportHeight / virtualRowHeight) + virtualOverscan * 2;
    const endIndex = Math.min(totalRows, startIndex + visibleCount);
    return {
      visibleRows: paginatedData.slice(startIndex, endIndex),
      topSpacerHeight: startIndex * virtualRowHeight,
      bottomSpacerHeight: Math.max(0, (totalRows - endIndex) * virtualRowHeight),
    };
  }, [paginatedData, useVirtualizedTable, virtualScrollTop, virtualRowHeight, virtualViewportHeight]);

  const getRowKey = (row: T, index: number) => {
    const candidate = row.id ?? row._id;
    if (candidate === null || candidate === undefined || candidate === "") {
      return `row-${index}`;
    }
    return String(candidate);
  };

  const addFilter = () => {
    if (availableFilterColumns.length === 0) return;
    setFilters((prev) => [
      ...prev,
      {
        id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        columnKey: availableFilterColumns[0].key,
        operator: "contains",
        value: "",
      },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<DataTableFilter>) => {
    setFilters((prev) =>
      prev.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter))
    );
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== id));
  };

  const clearFilters = () => {
    setFilters([]);
  };

  const exportCsv = () => {
    if (exportRows.length === 0) {
      toast.error("No rows available for export");
      return;
    }

    const headers = columns.map((column) => escapeCsvCell(column.label)).join(",");
    const lines = exportRows.map((row) =>
      columns.map((column) => escapeCsvCell(row[column.label])).join(",")
    );
    const csv = [headers, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${resolvedExportFileName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportRows.length} rows as CSV`);
  };

  const exportExcel = async () => {
    if (exportRows.length === 0) {
      toast.error("No rows available for export");
      return;
    }

    setIsExporting(true);
    try {
      const xlsx = await import("xlsx");
      const worksheet = xlsx.utils.json_to_sheet(exportRows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Data");
      xlsx.writeFile(workbook, `${resolvedExportFileName}.xlsx`);
      toast.success(`Exported ${exportRows.length} rows as Excel`);
    } catch (_error) {
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
    }
  };

  const rangeStart = filteredData.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = filteredData.length === 0 ? 0 : Math.min(page * pageSize, filteredData.length);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        {searchable && !(useGlobalPageSearch && pageSearch) && (
          <div className="relative w-full flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {filterable && availableFilterColumns.length > 0 && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                <Plus className="mr-2 h-4 w-4" />
                Add Filter
              </Button>
              {filters.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
              )}
            </>
          )}
          {exportable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={isExporting}>
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? "Exporting..." : "Export"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportExcel()} disabled={isExporting}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Export Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv} disabled={isExporting}>
                  <FileText className="mr-2 h-4 w-4" />
                  Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 per page</SelectItem>
              <SelectItem value="20">20 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filterable && filters.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Date range: add two filters on the same date column using
            {" "}
            <span className="font-medium">From Date (on/after)</span>
            {" "}
            and
            {" "}
            <span className="font-medium">To Date (on/before)</span>.
          </p>
          {filters.map((filter) => (
            <div
              key={filter.id}
              className="flex flex-col gap-2 rounded-md border bg-card/50 p-3 sm:flex-row sm:items-center"
            >
              <Select
                value={filter.columnKey}
                onValueChange={(value) => updateFilter(filter.id, { columnKey: value })}
              >
                <SelectTrigger className="sm:w-[220px]">
                  <SelectValue placeholder="Column" />
                </SelectTrigger>
                <SelectContent>
                  {availableFilterColumns.map((column) => (
                    <SelectItem key={column.key} value={column.key}>
                      {column.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filter.operator}
                onValueChange={(value) => updateFilter(filter.id, { operator: value as FilterOperator })}
              >
                <SelectTrigger className="sm:w-[140px]">
                  <SelectValue placeholder="Operator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="date_from">From Date (on/after)</SelectItem>
                  <SelectItem value="date_to">To Date (on/before)</SelectItem>
                </SelectContent>
              </Select>

              <Input
                value={filter.value}
                onChange={(event) => updateFilter(filter.id, { value: event.target.value })}
                type={filter.operator === "date_from" || filter.operator === "date_to" ? "date" : "text"}
                placeholder={
                  filter.operator === "date_from"
                    ? "From date"
                    : filter.operator === "date_to"
                      ? "To date"
                      : "Filter value..."
                }
                className="sm:flex-1"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFilter(filter.id)}
                className="self-end sm:self-auto"
                aria-label="Remove filter"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isMobile ? (
        <div className="space-y-3">
          {paginatedData.length === 0 ? (
            <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          ) : (
            paginatedData.map((row, index) => (
              <div
                key={getRowKey(row, index)}
                className={cn(
                  "rounded-lg border bg-card p-4 shadow-sm",
                  onRowClick && "cursor-pointer transition-colors hover:bg-muted/20"
                )}
                onClick={() => onRowClick?.(row)}
              >
                <div className="space-y-3">
                  {columns.map((column) => {
                    const rawValue = getValueByKey(row, column.key);
                    const renderedValue = column.render ? column.render(rawValue, row) : rawValue;
                    return (
                      <div key={column.key} className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {column.label}
                        </p>
                        <div className="break-words text-sm">{renderCellValue(renderedValue)}</div>
                      </div>
                    );
                  })}
                  {actions && (
                    <div className="border-t pt-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-2">{actions(row)}</div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div
          className={cn("rounded-lg border bg-card overflow-hidden", useVirtualizedTable && "overflow-y-auto")}
          style={useVirtualizedTable ? { maxHeight: `${virtualViewportHeight}px` } : undefined}
          onScroll={useVirtualizedTable ? (event) => setVirtualScrollTop(event.currentTarget.scrollTop) : undefined}
        >
          <Table className="data-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead key={column.key} className="font-semibold">
                    {column.label}
                  </TableHead>
                ))}
                {actions && <TableHead className="w-[100px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (actions ? 1 : 0)}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No results found.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {useVirtualizedTable && virtualWindow.topSpacerHeight > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length + (actions ? 1 : 0)}
                        style={{ height: `${virtualWindow.topSpacerHeight}px` }}
                      />
                    </TableRow>
                  )}
                  {(useVirtualizedTable ? virtualWindow.visibleRows : paginatedData).map((row, index) => (
                    <TableRow
                      key={getRowKey(row, index)}
                      className={cn(onRowClick && "cursor-pointer")}
                      onClick={() => onRowClick?.(row)}
                    >
                      {columns.map((column) => (
                        <TableCell key={column.key}>
                          {column.render
                            ? column.render(getValueByKey(row, column.key), row)
                            : renderCellValue(getValueByKey(row, column.key))}
                        </TableCell>
                      ))}
                      {actions && <TableCell onClick={(e) => e.stopPropagation()}>{actions(row)}</TableCell>}
                    </TableRow>
                  ))}
                  {useVirtualizedTable && virtualWindow.bottomSpacerHeight > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length + (actions ? 1 : 0)}
                        style={{ height: `${virtualWindow.bottomSpacerHeight}px` }}
                      />
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Showing {rangeStart} to {rangeEnd} of {filteredData.length} results
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages || filteredData.length === 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
