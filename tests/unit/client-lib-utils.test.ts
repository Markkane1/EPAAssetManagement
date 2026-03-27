/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveMock = vi.fn();
const setFillColorMock = vi.fn();
const rectMock = vi.fn();
const setTextColorMock = vi.fn();
const setFontSizeMock = vi.fn();
const setFontMock = vi.fn();
const textMock = vi.fn();
const getNumberOfPagesMock = vi.fn(() => 1);
const setPageMock = vi.fn();
const autoTableMock = vi.fn();

const categories = [
  { id: "cat-1", name: "General", scope: "GENERAL", asset_type: "CONSUMABLE" },
  { id: "cat-2", name: "Chemicals", scope: "LAB_ONLY", asset_type: "CONSUMABLE" },
];
const locations = [
  { id: "office-1", type: "HEAD_OFFICE", capabilities: { consumables: true, chemicals: false } },
  { id: "office-2", type: "DISTRICT_LAB", capabilities: { consumables: true, chemicals: true } },
];

class JsPdfMock {
  internal = { pageSize: { height: 297 } };
  setFillColor = setFillColorMock;
  rect = rectMock;
  setTextColor = setTextColorMock;
  setFontSize = setFontSizeMock;
  setFont = setFontMock;
  text = textMock;
  getNumberOfPages = getNumberOfPagesMock;
  setPage = setPageMock;
  save = saveMock;
}

vi.mock("jspdf", () => ({
  default: JsPdfMock,
}));

vi.mock("jspdf-autotable", () => ({
  default: autoTableMock,
}));

describe("client library utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("should filter, pick, format, and export rows", async () => {
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const appendMock = vi.spyOn(document.body, "appendChild");
    const removeMock = vi.spyOn(document.body, "removeChild");
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "a") {
        const element = originalCreateElement(tagName);
        element.click = clickMock;
        return element;
      }
      return originalCreateElement(tagName);
    }) as any);

    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:mock"), configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });

    const exportUtils = await import("../../client/src/lib/exportUtils");
    const rows = [
      { id: "1", name: "Laptop", nested: { label: "HQ" }, amount: 1234.5, date: "2026-01-02" },
      { id: "2", name: "Microscope", nested: { label: "Lab" }, amount: 5, date: null },
    ];

    expect(exportUtils.filterRowsBySearch(rows as any, "lap")).toHaveLength(1);
    expect(exportUtils.pickExportFields(rows as any, ["name", "nested.label"])).toEqual([
      { name: "Laptop", "nested.label": "HQ" },
      { name: "Microscope", "nested.label": "Lab" },
    ]);
    expect(exportUtils.formatDateForExport("2026-01-02")).toBe("2026-01-02");
    expect(exportUtils.formatDateForExport(null)).toBe("");
    expect(exportUtils.formatCurrencyForExport(1234.5)).toMatch(/PKR/);
    expect(exportUtils.formatCurrencyForExport(undefined)).toBe("");

    exportUtils.exportToCSV(rows as any, [{ key: "name", header: "Name" }], "rows");
    exportUtils.exportToJSON(rows, "rows");

    expect(clickMock).toHaveBeenCalledTimes(2);
    expect(appendMock).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalled();
  });

  it("should filter date ranges and generate report pdf", async () => {
    const reporting = await import("../../client/src/lib/reporting");
    const rows = [
      { when: "2026-01-01" },
      { when: "2026-02-01" },
    ];

    expect(reporting.filterByDateRange(rows, "when", new Date("2026-01-15"), undefined)).toEqual([{ when: "2026-02-01" }]);
    expect(reporting.getDateRangeText(new Date("2026-01-01"), new Date("2026-01-31"))).toMatch(/Jan/);
    expect(reporting.getDateRangeText(undefined, undefined)).toBe("All Time");

    await reporting.generateReportPDF({
      title: "Asset Summary",
      headers: ["Name"],
      data: [["Laptop"]],
      filename: "asset-summary",
      dateRangeText: "All Time",
    });

    expect(autoTableMock).toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith("asset-summary.pdf");
  });

  it("should create, filter, clear, and export audit logs", async () => {
    localStorage.setItem("user", JSON.stringify({ id: "user-1", email: "ava@example.com" }));
    const audit = await import("../../client/src/lib/auditLog");

    const entry = audit.createAuditLog("CREATE", "ASSET", { resource: "asset", resourceId: "asset-1", details: "created" });
    expect(entry.userEmail).toBe("ava@example.com");
    expect(audit.getAuditLogs()).toHaveLength(1);
    expect(localStorage.getItem("audit_logs")).toBeNull();
    expect(audit.filterAuditLogs({ category: "ASSET" })).toHaveLength(1);
    expect(audit.exportAuditLogsAsJSON()).toMatch(/asset-1/);
    expect(audit.exportAuditLogsAsCSV()).toMatch(/Timestamp/);

    audit.clearAuditLogs();
    expect(audit.getAuditLogs()).toEqual([]);
    expect(audit.auditLog.loginFailed("user@example.com", "bad password").status).toBe("failure");
  });

  it("should resolve consumable mode filters and unit conversions", async () => {
    const consumableMode = await import("../../client/src/lib/consumableMode");
    const unitUtils = await import("../../client/src/lib/unitUtils");

    expect(consumableMode.resolveChemicalsCapability({ type: "DISTRICT_LAB" } as any)).toBe(true);
    expect(consumableMode.resolveConsumablesCapability(null as any)).toBe(false);
    expect(consumableMode.filterItemsByMode([{ id: "1", is_chemical: true }, { id: "2", is_chemical: false }] as any, "chemicals")).toHaveLength(1);
    expect(consumableMode.filterConsumableCategoriesByMode(categories as any, "general")).toHaveLength(1);
    expect(consumableMode.filterLocationsByMode(locations as any, "chemicals")).toHaveLength(1);

    expect(unitUtils.normalizeUnitCode("milligram")).toBe("mg");
    expect(unitUtils.getUnitGroup("L")).toBe("volume");
    expect(unitUtils.getCompatibleUnits("g")).toContain("kg");
    expect(unitUtils.convertQuantity(1000, "mg", "g")).toBe(1);
    expect(unitUtils.convertQuantity(2, "g", "L")).toBeNull();
  });
});
