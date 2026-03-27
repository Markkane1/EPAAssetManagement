import type { ReactNode } from "react";
import { Download, FileDown } from "lucide-react";

import { MainLayout } from "@/components/layout/MainLayout";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";

type ReportColumn<Row> = {
  key: string;
  label: string;
  render?: (value: unknown, row: Row) => ReactNode;
};

interface ReportTablePageProps<Row> {
  title: string;
  description: string;
  layoutTitle?: string;
  layoutDescription?: string;
  columns: ReportColumn<Row>[];
  data: Row[];
  startDate?: Date;
  endDate?: Date;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onClearDateRange: () => void;
  dateRangeText: string;
  onExportCSV: () => void;
  onExportPDF: () => void | Promise<void>;
}

export function ReportTablePage<Row>({
  title,
  description,
  layoutTitle,
  layoutDescription,
  columns,
  data,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClearDateRange,
  dateRangeText,
  onExportCSV,
  onExportPDF,
}: ReportTablePageProps<Row>) {
  return (
    <MainLayout title={layoutTitle ?? title} description={layoutDescription ?? description}>
      <PageHeader
        title={title}
        description={description}
        extra={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button variant="outline" className="gap-2" onClick={onExportCSV}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button className="gap-2" onClick={onExportPDF}>
              <FileDown className="h-4 w-4" />
              PDF
            </Button>
          </div>
        }
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onClear={onClearDateRange}
        rangeText={dateRangeText}
      />

      <DataTable columns={columns as any} data={data as any} searchable />
    </MainLayout>
  );
}
