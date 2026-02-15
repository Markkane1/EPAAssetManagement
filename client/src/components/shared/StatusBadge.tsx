import { cn } from "@/lib/utils";
import { ItemStatus, AssignmentStatus, MaintenanceStatus, PurchaseOrderStatus } from "@/types";

type StatusType = ItemStatus | AssignmentStatus | MaintenanceStatus | PurchaseOrderStatus | string;

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusStyles: Record<string, string> = {
  // Item Status
  Available: "status-available",
  Assigned: "status-assigned",
  Maintenance: "status-maintenance",
  Damaged: "status-damaged",
  Retired: "status-retired",
  
  // Assignment Status
  Unassigned: "bg-muted text-muted-foreground",
  InTransit: "bg-info/10 text-info",
  
  // Maintenance Status
  Scheduled: "bg-info/10 text-info",
  InProgress: "bg-warning/10 text-warning",
  Completed: "bg-success/10 text-success",
  Cancelled: "bg-muted text-muted-foreground",
  
  // Purchase Order Status
  Draft: "bg-muted text-muted-foreground",
  Pending: "bg-warning/10 text-warning",
  Approved: "bg-info/10 text-info",
  Received: "bg-success/10 text-success",

  // Transfer Status
  REQUESTED: "bg-warning/10 text-warning",
  APPROVED: "bg-info/10 text-info",
  DISPATCHED_TO_STORE: "bg-warning/10 text-warning",
  RECEIVED_AT_STORE: "bg-info/10 text-info",
  DISPATCHED_TO_DEST: "bg-warning/10 text-warning",
  RECEIVED_AT_DEST: "bg-success/10 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn("status-badge", statusStyles[status] || "bg-muted text-muted-foreground", className)}>
      {status}
    </span>
  );
}
