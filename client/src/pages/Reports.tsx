import { useMemo, useState } from "react";
import type { ElementType } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  DollarSign,
  Download,
  FileDown,
  FileText,
  Loader2,
  MapPin,
  Package,
  PieChart,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { getDateRangeText } from "@/lib/reporting";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { DataTable } from "@/components/shared/DataTable";
import { useAuth } from "@/contexts/AuthContext";
import type { ReportExportType, ReportId } from "@/pages/reports/reportGeneration";

interface ReportCard {
  id: ReportId;
  title: string;
  description: string;
  icon: ElementType;
  category: string;
}

const reports: ReportCard[] = [
  {
    id: "asset-summary",
    title: "Asset Summary Report",
    description: "Aggregated views of assets by location and category",
    icon: Package,
    category: "Assets",
  },
  {
    id: "asset-items-inventory",
    title: "Asset Items Inventory",
    description: "Complete inventory of all asset items with status",
    icon: ClipboardList,
    category: "Assets",
  },
  {
    id: "assignment-summary",
    title: "Assignment Summary",
    description: "Total assignments by employee and directorate",
    icon: Users,
    category: "Assignments",
  },
  {
    id: "status-report",
    title: "Status Distribution",
    description: "Distribution of items by functional status",
    icon: PieChart,
    category: "Assets",
  },
  {
    id: "maintenance-report",
    title: "Maintenance Report",
    description: "All maintenance records with costs and status",
    icon: Wrench,
    category: "Maintenance",
  },
  {
    id: "location-inventory",
    title: "Location Inventory",
    description: "Detailed inventory by physical location",
    icon: MapPin,
    category: "Inventory",
  },
  {
    id: "financial-summary",
    title: "Financial Summary",
    description: "Total asset value and acquisition costs",
    icon: DollarSign,
    category: "Financial",
  },
  {
    id: "employee-assets",
    title: "Employee Assets Report",
    description: "Assets assigned to each employee",
    icon: FileText,
    category: "Assignments",
  },
];

const categoryColors: Record<string, string> = {
  Assets: "bg-primary/10 text-primary",
  Assignments: "bg-info/10 text-info",
  Financial: "bg-success/10 text-success",
  Maintenance: "bg-warning/10 text-warning",
  Inventory: "bg-accent text-accent-foreground",
};

const EMPLOYEE_REPORT_IDS = new Set<ReportId>(["assignment-summary", "employee-assets"]);

export default function Reports() {
  const { role, user } = useAuth();
  const isEmployeeRole = role === "employee";
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const { mode: viewMode, setMode: setViewMode } = useViewMode("reports");
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();

  const handleGenerateReport = async (
    reportId: ReportId,
    reportTitle: string,
    exportType: ReportExportType
  ) => {
    if (isEmployeeRole && !EMPLOYEE_REPORT_IDS.has(reportId)) {
      toast.error("You can only generate your own assignment reports.");
      return;
    }

    setGeneratingReport(`${reportId}-${exportType}`);

    try {
      const { generateRequestedReport } = await import("@/pages/reports/reportGeneration");
      const result = await generateRequestedReport({
        reportId,
        exportType,
        startDate,
        endDate,
        isEmployeeRole,
        userId: user?.id || null,
        userEmail: user?.email || null,
      });

      if (result.notice) {
        toast.info(result.notice);
      }

      toast.success(`${reportTitle} generated!`, {
        description: `Your ${exportType.toUpperCase()} report has been downloaded.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate report.");
    } finally {
      setGeneratingReport(null);
    }
  };

  const clearDateRange = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const filteredReports = useMemo(
    () =>
      reports
        .filter((report) => (isEmployeeRole ? EMPLOYEE_REPORT_IDS.has(report.id) : true))
        .filter((report) => {
          if (!searchTerm) return true;
          return [report.title, report.description, report.category]
            .join(" ")
            .toLowerCase()
            .includes(searchTerm);
        }),
    [isEmployeeRole, searchTerm]
  );

  const columns = [
    {
      key: "title",
      label: "Report",
      render: (value: string, row: ReportCard) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{row.description}</p>
        </div>
      ),
    },
    { key: "category", label: "Category" },
  ];

  const actions = (row: ReportCard) => {
    const isGeneratingCSV = generatingReport === `${row.id}-csv`;
    const isGeneratingPDF = generatingReport === `${row.id}-pdf`;

    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => handleGenerateReport(row.id, row.title, "csv")}
          disabled={isGeneratingCSV || isGeneratingPDF}
        >
          {isGeneratingCSV ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          CSV
        </Button>
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={() => handleGenerateReport(row.id, row.title, "pdf")}
          disabled={isGeneratingCSV || isGeneratingPDF}
        >
          {isGeneratingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          PDF
        </Button>
      </div>
    );
  };

  return (
    <MainLayout title="Reports" description="Generate and view reports">
      <PageHeader
        title="Reports"
        description={
          isEmployeeRole
            ? "Generate reports for your own assignments and asset history"
            : "Generate detailed reports for assets, assignments, and financials"
        }
        extra={<ViewModeToggle mode={viewMode} onModeChange={setViewMode} />}
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onClear={clearDateRange}
        rangeText={getDateRangeText(startDate, endDate)}
      />

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={filteredReports}
          searchable={false}
          useGlobalPageSearch={false}
          actions={actions}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredReports.map((report) => {
              const Icon = report.icon;
              const isGeneratingCSV = generatingReport === `${report.id}-csv`;
              const isGeneratingPDF = generatingReport === `${report.id}-pdf`;

              return (
                <Card key={report.id} className="group transition-all hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${categoryColors[report.category]}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {report.category}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <h3 className="mb-1 font-semibold">{report.title}</h3>
                    <p className="mb-4 text-sm text-muted-foreground">{report.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => handleGenerateReport(report.id, report.title, "csv")}
                        disabled={isGeneratingCSV || isGeneratingPDF}
                      >
                        {isGeneratingCSV ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        CSV
                      </Button>
                      <Button
                        variant="default"
                        className="flex-1 gap-2"
                        onClick={() => handleGenerateReport(report.id, report.title, "pdf")}
                        disabled={isGeneratingCSV || isGeneratingPDF}
                      >
                        {isGeneratingPDF ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileDown className="h-4 w-4" />
                        )}
                        PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredReports.length === 0 && (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No reports found.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </MainLayout>
  );
}
