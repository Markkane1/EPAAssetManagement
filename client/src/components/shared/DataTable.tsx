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
  FileText,
  Inbox,
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
import { StatePanel } from "@/components/shared/workflow";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pagination?: boolean;
  externalPage?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onExternalPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
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
  toolbarContent?: React.ReactNode;
  emptyState?: {
    title: string;
    description: string;
    action?: React.ReactNode;
  };
  onDisplayStateChange?: (state: {
    currentPage: number;
    pageSize: number;
    filteredCount: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
  }) => void;
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
  pagination = true,
  externalPage,
  pageSize: controlledPageSize,
  pageSizeOptions = [10, 20, 50, 100],
  onExternalPageChange,
  onPageSizeChange,
  showPageSizeSelector,
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
  toolbarContent,
  emptyState,
  onDisplayStateChange,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const pageSearch = usePageSearchContext();
  const [filters, setFilters] = useState<DataTableFilter[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  // Nested table scroll caused the "more than 20 rows" regression across server-backed pages.
  // Keep the prop API compatible, but render tables at natural document height repo-wide.
  const virtualizationEnabled = false;
  const useVirtualizedTable = virtualizationEnabled ? virtualized && !isMobile : false;
  const availableFilterColumns = useMemo(
    () => columns.filter((column) => Boolean(column.key)),
    [columns]
  );

  const effectiveSearch = useGlobalPageSearch && pageSearch ? pageSearch.term : search;
  const resolvedPageSize = controlledPageSize ?? pageSize;
  const usesExternalPagination = externalPage !== undefined;
  const currentPage = usesExternalPagination ? externalPage : page;
  const canSelectPageSize =
    (showPageSizeSelector ?? (pagination || typeof onPageSizeChange === "function")) &&
    pageSizeOptions.length > 0;
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
    if (usesExternalPagination) {
      onExternalPageChange?.(1);
      return;
    }
    setPage(1);
  }, [effectiveSearch, activeFilterSignature, onExternalPageChange, usesExternalPagination]);

  useEffect(() => {
    if (controlledPageSize === undefined) return;
    setPageSize(controlledPageSize);
  }, [controlledPageSize]);

  useEffect(() => {
    setVirtualScrollTop(0);
  }, [currentPage, resolvedPageSize, effectiveSearch, data.length, useVirtualizedTable, activeFilterSignature]);

  const normalizedSearch = effectiveSearch.trim().toLowerCase();
  const searchBlobByRow = useMemo(
    () =>
      data.map((row) => {
        const tokens: string[] = [];
        appendSearchTokens(row, tokens, new WeakSet<object>());
        return tokens.join(" ").trim();
      }),
    [data]
  );
  const filterValueCacheByRowAndColumn = useMemo(() => {
    const cache = new Map<number, Map<string, string>>();
    data.forEach((row, rowIndex) => {
      const rowCache = new Map<string, string>();
      activeFilters.forEach((filter) => {
        rowCache.set(filter.columnKey, stringifyFilterValue(getValueByKey(row, filter.columnKey)));
      });
      cache.set(rowIndex, rowCache);
    });
    return cache;
  }, [activeFilters, data]);

  const filteredData = useMemo(() => {
    return data.filter((row, rowIndex) => {
      if (normalizedSearch) {
        const searchBlob = searchBlobByRow[rowIndex] || "";
        const matchesSearch = searchBlob.includes(normalizedSearch);
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
        const value =
          filterValueCacheByRowAndColumn.get(rowIndex)?.get(filter.columnKey) ??
          stringifyFilterValue(rawValue);
        const normalizedFilterValue = filterValue.toLowerCase();
        if (filter.operator === "equals") {
          return value === normalizedFilterValue;
        }
        return value.includes(normalizedFilterValue);
      });
    });
  }, [activeFilters, data, filterValueCacheByRowAndColumn, normalizedSearch, searchBlobByRow]);

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

  const totalPages = Math.max(1, Math.ceil(filteredData.length / resolvedPageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      if (usesExternalPagination) {
        onExternalPageChange?.(totalPages);
        return;
      }
      setPage(totalPages);
    }
  }, [currentPage, onExternalPageChange, totalPages, usesExternalPagination]);

  const paginatedData = useMemo(
    () =>
      pagination || usesExternalPagination
        ? filteredData.slice((currentPage - 1) * resolvedPageSize, currentPage * resolvedPageSize)
        : filteredData,
    [filteredData, currentPage, resolvedPageSize, pagination, usesExternalPagination]
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

  const handlePageSizeChange = (value: string) => {
    const nextPageSize = Number(value);
    if (!Number.isFinite(nextPageSize) || nextPageSize <= 0) return;
    if (controlledPageSize === undefined) {
      setPageSize(nextPageSize);
    }
    onPageSizeChange?.(nextPageSize);
    if (usesExternalPagination) {
      onExternalPageChange?.(1);
      return;
    }
    setPage(1);
  };

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

  const rangeStart = pagination || usesExternalPagination
    ? filteredData.length === 0
      ? 0
      : (currentPage - 1) * resolvedPageSize + 1
    : filteredData.length === 0
      ? 0
      : 1;
  const rangeEnd = pagination || usesExternalPagination
    ? filteredData.length === 0
      ? 0
      : Math.min(currentPage * resolvedPageSize, filteredData.length)
    : filteredData.length;

  const emptyStateContent = emptyState || {
    title: "No results found.",
    description: "Try adjusting the current search term or filters to broaden the result set.",
  };

  useEffect(() => {
    onDisplayStateChange?.({
      currentPage,
      pageSize: resolvedPageSize,
      filteredCount: filteredData.length,
      totalPages,
      rangeStart,
      rangeEnd,
    });
  }, [currentPage, filteredData.length, onDisplayStateChange, rangeEnd, rangeStart, resolvedPageSize, totalPages]);

  return (
    <div className="space-y-4">
      <div className="workflow-filter-bar">
        <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center lg:gap-4">
          {searchable && !(useGlobalPageSearch && pageSearch) && (
            <div className="relative w-full flex-1 lg:max-w-sm">
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
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            {toolbarContent}
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
                  <Button type="button" variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportCsv}>
                    <FileText className="mr-2 h-4 w-4" />
                    Export CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canSelectPageSize && (
              <Select value={String(resolvedPageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="w-full sm:w-[140px]" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {filterable && filters.length > 0 && (
        <div className="space-y-3">
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
              className="flex flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-white p-3 sm:flex-row sm:items-center"
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
            <div className="space-y-3">
              <StatePanel
                title={emptyStateContent.title}
                description={emptyStateContent.description}
                icon={Inbox}
                className="p-5"
              />
              {emptyStateContent.action}
            </div>
          ) : (
            paginatedData.map((row, index) => (
              <div
                key={getRowKey(row, index)}
                className={cn(
                  "rounded-[1.5rem] border border-border/70 bg-white p-4 shadow-[0_18px_48px_-40px_rgba(26,28,24,0.14)]",
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
          className={cn("table-shell", useVirtualizedTable && "overflow-y-auto")}
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
                    className="h-28"
                  >
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-4 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                        <Inbox className="h-5 w-5" />
                      </div>
                      <p className="font-medium text-foreground">{emptyStateContent.title}</p>
                      <p className="text-sm text-muted-foreground">{emptyStateContent.description}</p>
                      {emptyStateContent.action}
                    </div>
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

      {pagination && !usesExternalPagination && (
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Showing {rangeStart} to {rangeEnd} of {filteredData.length} results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              Page {currentPage} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages || filteredData.length === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
