import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileJson } from "lucide-react";
import { toast } from "sonner";

interface ExportButtonProps {
  onExportCSV: () => void;
  onExportJSON?: () => void;
  disabled?: boolean;
  label?: string;
}

export function ExportButton({ 
  onExportCSV, 
  onExportJSON, 
  disabled = false,
  label = "Export" 
}: ExportButtonProps) {
  const handleCSVExport = () => {
    try {
      onExportCSV();
      toast.success("CSV export completed");
    } catch (error) {
      toast.error("Failed to export CSV");
    }
  };

  const handleJSONExport = () => {
    if (onExportJSON) {
      try {
        onExportJSON();
        toast.success("JSON export completed");
      } catch (error) {
        toast.error("Failed to export JSON");
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="h-4 w-4 mr-2" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCSVExport}>
          <FileText className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        {onExportJSON && (
          <DropdownMenuItem onClick={handleJSONExport}>
            <FileJson className="h-4 w-4 mr-2" />
            Export as JSON
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}