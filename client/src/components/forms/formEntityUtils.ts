export function getFormEntityId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const record = value as { id?: unknown; _id?: unknown; toString?: () => string };
    if (typeof record.id === "string") return record.id;
    if (typeof record._id === "string") return record._id;
    if (record._id && typeof record._id === "object" && "toString" in (record._id as object)) {
      const parsed = String(record._id);
      if (parsed && parsed !== "[object Object]") return parsed;
    }
    if (typeof record.toString === "function") {
      const parsed = record.toString();
      if (parsed && parsed !== "[object Object]") return parsed;
    }
  }

  return "";
}
