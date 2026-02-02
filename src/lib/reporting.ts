import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function filterByDateRange<T extends Record<string, unknown>>(
  data: T[] | undefined,
  dateField: keyof T,
  startDate?: Date,
  endDate?: Date
): T[] {
  if (!data) return [];
  if (!startDate && !endDate) return data;

  return data.filter((item) => {
    const raw = item[dateField];
    if (!raw) return true;
    const itemDate = new Date(String(raw));

    if (startDate && endDate) {
      return itemDate >= startDate && itemDate <= endDate;
    }
    if (startDate) {
      return itemDate >= startDate;
    }
    if (endDate) {
      return itemDate <= endDate;
    }
    return true;
  });
}

export function getDateRangeText(startDate?: Date, endDate?: Date) {
  if (startDate && endDate) {
    return `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`;
  }
  if (startDate) {
    return `From ${format(startDate, "MMM d, yyyy")}`;
  }
  if (endDate) {
    return `Until ${format(endDate, "MMM d, yyyy")}`;
  }
  return "All Time";
}

export function generateReportPDF(params: {
  title: string;
  headers: string[];
  data: (string | number)[][];
  filename: string;
  dateRangeText: string;
}) {
  const { title, headers, data, filename, dateRangeText } = params;
  const doc = new jsPDF();

  // Add EPA branding header
  doc.setFillColor(46, 111, 64); // EPA Green #2E6F40
  doc.rect(0, 0, 210, 35, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("EPA Asset Management System", 14, 18);

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 28);

  // Reset text color for body
  doc.setTextColor(0, 0, 0);

  // Add date range and generation info
  doc.setFontSize(10);
  doc.text(`Date Range: ${dateRangeText}`, 14, 45);
  doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, 14, 52);

  // Add table
  autoTable(doc, {
    head: [headers],
    body: data,
    startY: 60,
    headStyles: {
      fillColor: [37, 61, 44], // Dark green #253D2C
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [207, 255, 220], // Light mint #CFFFDC
    },
    margin: { top: 60 },
    styles: {
      cellPadding: 3,
      overflow: "linebreak",
    },
  });

  // Add footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount} | EPA Asset Management System`,
      105,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }

  doc.save(`${filename}.pdf`);
}
