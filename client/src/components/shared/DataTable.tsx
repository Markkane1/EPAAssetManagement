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
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usePageSearch as usePageSearchContext } from "@/contexts/PageSearchContext";

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
  searchPlaceholder?: string;
  useGlobalPageSearch?: boolean;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => React.ReactNode;
  virtualized?: boolean;
  virtualRowHeight?: number;
  virtualViewportHeight?: number;
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

export function DataTable<T extends { id?: string; _id?: string }>({
  columns,
  data,
  searchable = true,
  searchPlaceholder = "Search...",
  useGlobalPageSearch = true,
  onRowClick,
  actions,
  virtualized = false,
  virtualRowHeight = 52,
  virtualViewportHeight = 560,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const pageSearch = usePageSearchContext();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);

  const effectiveSearch = useGlobalPageSearch && pageSearch ? pageSearch.term : search;

  useEffect(() => {
    setPage(1);
  }, [effectiveSearch]);

  useEffect(() => {
    setVirtualScrollTop(0);
  }, [page, pageSize, effectiveSearch, data.length, virtualized]);

  const normalizedSearch = effectiveSearch.trim().toLowerCase();

  const filteredData = useMemo(() => {
    if (!normalizedSearch) return data;
    return data.filter((row) => {
      const tokens: string[] = [];
      appendSearchTokens(row, tokens, new WeakSet<object>());
      return tokens.some((token) => token.includes(normalizedSearch));
    });
  }, [data, normalizedSearch]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * pageSize, page * pageSize),
    [filteredData, page, pageSize]
  );
  const virtualOverscan = 6;
  const virtualWindow = useMemo(() => {
    if (!virtualized) {
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
  }, [paginatedData, virtualized, virtualScrollTop, virtualRowHeight, virtualViewportHeight]);

  const getValue = (row: T, key: string): unknown => {
    return key.split(".").reduce<unknown>((obj, k) => {
      if (obj && typeof obj === "object" && k in obj) {
        return (obj as Record<string, unknown>)[k];
      }
      return undefined;
    }, row);
  };

  const getRowKey = (row: T, index: number) => {
    const candidate = row.id ?? row._id;
    if (candidate === null || candidate === undefined || candidate === "") {
      return `row-${index}`;
    }
    return String(candidate);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        {searchable && !(useGlobalPageSearch && pageSearch) && (
          <div className="relative flex-1 max-w-sm">
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
        <div className="flex items-center gap-2">
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

      {/* Table */}
      <div
        className={cn("rounded-lg border bg-card overflow-hidden", virtualized && "overflow-y-auto")}
        style={virtualized ? { maxHeight: `${virtualViewportHeight}px` } : undefined}
        onScroll={virtualized ? (event) => setVirtualScrollTop(event.currentTarget.scrollTop) : undefined}
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
                {virtualized && virtualWindow.topSpacerHeight > 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (actions ? 1 : 0)}
                      style={{ height: `${virtualWindow.topSpacerHeight}px` }}
                    />
                  </TableRow>
                )}
                {(virtualized ? virtualWindow.visibleRows : paginatedData).map((row, index) => (
                <TableRow
                  key={getRowKey(row, index)}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.render
                        ? column.render(getValue(row, column.key), row)
                        : getValue(row, column.key)}
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {actions(row)}
                    </TableCell>
                  )}
                </TableRow>
                ))}
                {virtualized && virtualWindow.bottomSpacerHeight > 0 && (
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {(page - 1) * pageSize + 1} to{" "}
          {Math.min(page * pageSize, filteredData.length)} of {filteredData.length} results
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
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
