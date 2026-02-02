import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, User, Calendar, ArrowRight } from "lucide-react";

interface AssignmentHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "employee" | "assetItem";
  targetId: string;
  targetName: string;
  assignments: any[];
  assetItems: any[];
  employees: any[];
  assets: any[];
}

export function AssignmentHistoryModal({
  open,
  onOpenChange,
  type,
  targetId,
  targetName,
  assignments,
  assetItems,
  employees,
  assets,
}: AssignmentHistoryModalProps) {
  // Filter assignments based on type
  const filteredAssignments = assignments
    .filter((a) =>
      type === "employee"
        ? a.employee_id === targetId
        : a.asset_item_id === targetId
    )
    .sort((a, b) => new Date(b.assigned_date).getTime() - new Date(a.assigned_date).getTime());

  const getAssetItemDetails = (assetItemId: string) => {
    const item = assetItems.find((i) => i.id === assetItemId);
    const asset = item ? assets.find((a) => a.id === item.asset_id) : null;
    return { item, asset };
  };

  const getEmployeeDetails = (employeeId: string) => {
    return employees.find((e) => e.id === employeeId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "employee" ? (
              <User className="h-5 w-5 text-primary" />
            ) : (
              <Package className="h-5 w-5 text-primary" />
            )}
            Assignment History
          </DialogTitle>
          <DialogDescription>
            {type === "employee"
              ? `All assignments for employee: ${targetName}`
              : `All assignments for asset item: ${targetName}`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No assignment history found.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssignments.map((assignment) => {
                const { item, asset } = getAssetItemDetails(assignment.asset_item_id);
                const employee = getEmployeeDetails(assignment.employee_id);
                const isActive = assignment.is_active && !assignment.returned_date;

                return (
                  <div
                    key={assignment.id}
                    className={`p-4 rounded-lg border ${
                      isActive ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        {type === "employee" ? (
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{asset?.name || "Unknown Asset"}</span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {item?.tag}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {employee
                                ? `${employee.first_name} ${employee.last_name}`
                                : "Unknown Employee"}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{new Date(assignment.assigned_date).toLocaleDateString()}</span>
                          {assignment.returned_date && (
                            <>
                              <ArrowRight className="h-3.5 w-3.5" />
                              <span>{new Date(assignment.returned_date).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>

                        {assignment.notes && (
                          <p className="text-xs text-muted-foreground italic">
                            {assignment.notes}
                          </p>
                        )}
                      </div>

                      <Badge
                        variant={isActive ? "default" : "secondary"}
                        className={isActive ? "bg-success text-success-foreground" : ""}
                      >
                        {assignment.returned_date
                          ? "Returned"
                          : isActive
                          ? "Active"
                          : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
