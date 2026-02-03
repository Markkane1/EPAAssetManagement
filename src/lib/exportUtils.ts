import { format } from "date-fns";

function getValueByKey(row: Record<string, unknown>, key: string) {
  return key.split(".").reduce<unknown>((obj, part) => {
    if (obj && typeof obj === "object" && part in obj) {
      return (obj as Record<string, unknown>)[part];
    }
    return undefined;
  }, row);
}

export function filterRowsBySearch<T extends Record<string, unknown>>(data: T[], term: string) {
  const searchTerm = term.trim().toLowerCase();
  if (!searchTerm) return data;
  return data.filter((row) =>
    Object.values(row).some((value) => String(value).toLowerCase().includes(searchTerm)),
  );
}

export function pickExportFields<T extends Record<string, unknown>>(data: T[], keys: string[]) {
  return data.map((row) => {
    const entry: Record<string, unknown> = {};
    keys.forEach((key) => {
      entry[key] = getValueByKey(row, key);
    });
    return entry;
  });
}

// Generic CSV export function
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string; formatter?: (value: unknown) => string }[],
  filename: string
) {
  if (data.length === 0) return;

  const headers = columns.map(col => col.header).join(",");
  
  const rows = data.map(item =>
    columns
      .map(col => {
        const value = item[col.key];
        let formatted = col.formatter ? col.formatter(value) : String(value ?? "");
        // Escape quotes and wrap in quotes if contains comma
        formatted = formatted.replace(/"/g, '""');
        if (formatted.includes(",") || formatted.includes('"') || formatted.includes("\n")) {
          formatted = `"${formatted}"`;
        }
        return formatted;
      })
      .join(",")
  ).join("\n");

  const csv = `${headers}\n${rows}`;
  downloadFile(csv, `${filename}.csv`, "text/csv");
}

// Date formatter for exports
export function formatDateForExport(date: Date | string | undefined | null): string {
  if (!date) return "";
  try {
    return format(new Date(date), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

// Currency formatter for exports
export function formatCurrencyForExport(value: number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return `PKR ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Download helper
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export to JSON
export function exportToJSON<T>(data: T[], filename: string) {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `${filename}.json`, "application/json");
}
