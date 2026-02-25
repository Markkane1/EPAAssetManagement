import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRightLeft, Calendar, Package, User } from "lucide-react";
import type { Assignment, Asset, AssetItem, Employee, Location, Transfer } from "@/types";
import type { UserWithDetails } from "@/services/userService";
import type { OfficeSubLocation } from "@/services/officeSubLocationService";

interface AssignmentHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "employee" | "assetItem";
  targetId: string;
  targetName: string;
  assignments: Assignment[];
  assetItems: AssetItem[];
  employees: Employee[];
  assets: Asset[];
  transfers?: Transfer[];
  locations?: Location[];
  users?: UserWithDetails[];
  officeSubLocations?: OfficeSubLocation[];
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
  transfers = [],
  locations = [],
  users = [],
  officeSubLocations = [],
}: AssignmentHistoryModalProps) {
  type HistoryEvent = {
    id: string;
    type: "ASSIGNMENT" | "TRANSFER";
    status: string;
    title: string;
    timestamp: string;
    actorName: string;
    actorContext: string;
    contextLine: string;
    notes?: string | null;
  };

  const locationById = new Map(locations.map((location) => [location.id, location]));
  const subLocationById = new Map(officeSubLocations.map((subLocation) => [subLocation.id, subLocation]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const userById = new Map<string, UserWithDetails>();
  users.forEach((user) => {
    if (user.id) userById.set(user.id, user);
    if (user.user_id) userById.set(user.user_id, user);
  });

  const formatUserName = (user?: UserWithDetails) => {
    if (!user) return "Unknown user";
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    return fullName || user.email || user.id || "Unknown user";
  };

  const getUserMeta = (userId?: string | null) => {
    if (!userId) return { name: "System", context: "-" };
    const user = userById.get(String(userId));
    if (!user) return { name: String(userId), context: "-" };
    const officeName = user.location_name || (user.location_id ? locationById.get(user.location_id)?.name : null);
    return { name: formatUserName(user), context: officeName || "-" };
  };

  const resolveOfficeName = (officeId?: string | null) => {
    if (!officeId) return "Unknown office";
    return locationById.get(String(officeId))?.name || String(officeId);
  };

  const resolveTransferOfficeName = (transfer: Transfer, officeId: string) => {
    if (transfer.store_id && String(officeId) === String(transfer.store_id)) {
      return "Central Store";
    }
    return resolveOfficeName(officeId);
  };

  const resolveAssignmentTargetContext = (assignment: Assignment) => {
    if (String(assignment.assigned_to_type || "") === "SUB_LOCATION") {
      const subLocation = assignment.assigned_to_id
        ? subLocationById.get(String(assignment.assigned_to_id))
        : undefined;
      const officeName = subLocation?.office_id ? resolveOfficeName(subLocation.office_id) : "Unknown office";
      return {
        targetName: subLocation?.name || assignment.assigned_to_id || "Unknown station",
        contextLine: `Station: ${subLocation?.name || assignment.assigned_to_id || "Unknown"} (${officeName})`,
      };
    }

    const employeeId = assignment.assigned_to_id || assignment.employee_id;
    const employee = employeeId ? employeeById.get(String(employeeId)) : undefined;
    const employeeName = employee
      ? `${employee.first_name || ""} ${employee.last_name || ""}`.trim() || employee.email || employee.id
      : String(employeeId || "Unknown employee");
    const officeName = employee?.location_id ? resolveOfficeName(employee.location_id) : "Unknown office";
    return {
      targetName: employeeName,
      contextLine: `Employee: ${employeeName} (${officeName})`,
    };
  };

  const eventDate = (value?: string | null) => {
    if (!value) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  };

  const filteredAssignments = assignments
    .filter((a) =>
      type === "employee"
        ? a.employee_id === targetId || a.assigned_to_id === targetId
        : a.asset_item_id === targetId
    )
    .sort((a, b) => new Date(b.assigned_date || b.created_at).getTime() - new Date(a.assigned_date || a.created_at).getTime());

  const filteredTransfers =
    type === "assetItem"
      ? transfers
          .filter((transfer) =>
            (transfer.lines || []).some((line) => String(line.asset_item_id || "") === String(targetId))
          )
          .sort((a, b) => new Date(b.transfer_date || b.created_at).getTime() - new Date(a.transfer_date || a.created_at).getTime())
      : [];

  const getAssetItemDetails = (assetItemId: string) => {
    const item = assetItems.find((i) => i.id === assetItemId);
    const asset = item ? assets.find((a) => a.id === item.asset_id) : null;
    return { item, asset };
  };

  const assignmentEvents: HistoryEvent[] = filteredAssignments.flatMap((assignment) => {
    const { item, asset } = getAssetItemDetails(assignment.asset_item_id);
    const target = resolveAssignmentTargetContext(assignment);
    const issuedBy = getUserMeta(assignment.issued_by_user_id);
    const requestedBy = getUserMeta(assignment.return_requested_by_user_id);
    const returnedBy = getUserMeta(assignment.returned_by_user_id);
    const assetLabel = `${asset?.name || "Unknown Asset"} ${item?.tag ? `(${item.tag})` : ""}`.trim();
    const events: HistoryEvent[] = [];

    const issuedTimestamp = assignment.issued_at || assignment.assigned_date || assignment.created_at;
    events.push({
      id: `${assignment.id}-issued`,
      type: "ASSIGNMENT",
      status: "ISSUED",
      title: `Assignment issued for ${assetLabel}`,
      timestamp: eventDate(issuedTimestamp),
      actorName: issuedBy.name,
      actorContext: issuedBy.context,
      contextLine: target.contextLine,
      notes: assignment.notes,
    });

    if (assignment.return_requested_at) {
      events.push({
        id: `${assignment.id}-requested-return`,
        type: "ASSIGNMENT",
        status: "RETURN_REQUESTED",
        title: `Return requested for ${assetLabel}`,
        timestamp: eventDate(assignment.return_requested_at),
        actorName: requestedBy.name,
        actorContext: requestedBy.context,
        contextLine: target.contextLine,
        notes: assignment.notes,
      });
    }

    const returnedTimestamp = assignment.returned_at || assignment.returned_date;
    if (returnedTimestamp) {
      events.push({
        id: `${assignment.id}-returned`,
        type: "ASSIGNMENT",
        status: "RETURNED",
        title: `Assignment closed for ${assetLabel}`,
        timestamp: eventDate(returnedTimestamp),
        actorName: returnedBy.name,
        actorContext: returnedBy.context,
        contextLine: target.contextLine,
        notes: assignment.notes,
      });
    }

    return events;
  });

  const transferStageMeta: Array<{
    status: string;
    timestampKey: keyof Transfer;
    actorKey: keyof Transfer;
    title: string;
  }> = [
    { status: "REQUESTED", timestampKey: "requested_at", actorKey: "requested_by_user_id", title: "Transfer requested" },
    { status: "APPROVED", timestampKey: "approved_at", actorKey: "approved_by_user_id", title: "Transfer approved" },
    {
      status: "DISPATCHED_TO_STORE",
      timestampKey: "dispatched_to_store_at",
      actorKey: "dispatched_to_store_by_user_id",
      title: "Dispatched to Central Store",
    },
    {
      status: "RECEIVED_AT_STORE",
      timestampKey: "received_at_store_at",
      actorKey: "received_at_store_by_user_id",
      title: "Received at Central Store",
    },
    {
      status: "DISPATCHED_TO_DEST",
      timestampKey: "dispatched_to_dest_at",
      actorKey: "dispatched_to_dest_by_user_id",
      title: "Dispatched to Destination",
    },
    {
      status: "RECEIVED_AT_DEST",
      timestampKey: "received_at_dest_at",
      actorKey: "received_at_dest_by_user_id",
      title: "Received at Destination",
    },
    { status: "REJECTED", timestampKey: "rejected_at", actorKey: "rejected_by_user_id", title: "Transfer rejected" },
    { status: "CANCELLED", timestampKey: "cancelled_at", actorKey: "cancelled_by_user_id", title: "Transfer cancelled" },
  ];

  const transferEvents: HistoryEvent[] = filteredTransfers.flatMap((transfer) => {
    const fromName = resolveTransferOfficeName(transfer, transfer.from_office_id);
    const toName = resolveTransferOfficeName(transfer, transfer.to_office_id);
    const routeLine = `${fromName} -> ${toName}`;
    const events: HistoryEvent[] = [];

    transferStageMeta.forEach((stage) => {
      const rawTimestamp = transfer[stage.timestampKey];
      if (!rawTimestamp) return;
      const actor = getUserMeta((transfer[stage.actorKey] as string | null) || transfer.handled_by);
      events.push({
        id: `${transfer.id}-${stage.status}`,
        type: "TRANSFER",
        status: stage.status,
        title: `${stage.title} (Transfer ${transfer.id})`,
        timestamp: eventDate(String(rawTimestamp)),
        actorName: actor.name,
        actorContext: actor.context,
        contextLine: routeLine,
        notes: transfer.notes,
      });
    });

    if (events.length === 0) {
      const fallbackActor = getUserMeta(transfer.handled_by);
      events.push({
        id: `${transfer.id}-summary`,
        type: "TRANSFER",
        status: transfer.status || "TRANSFER",
        title: `Transfer ${transfer.id} (${transfer.status || "UNKNOWN"})`,
        timestamp: eventDate(transfer.transfer_date || transfer.created_at),
        actorName: fallbackActor.name,
        actorContext: fallbackActor.context,
        contextLine: routeLine,
        notes: transfer.notes,
      });
    }

    return events;
  });

  const events = [...assignmentEvents, ...transferEvents].sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );

  const title = type === "employee" ? "Assignment History" : "Item History Timeline";
  const description =
    type === "employee"
      ? `All assignments for employee: ${targetName}`
      : `Assignment and transfer timeline for asset item: ${targetName}`;

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
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          {events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No history found.
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const eventDateText = event.timestamp
                  ? new Date(event.timestamp).toLocaleString()
                  : "Unknown date";
                const icon =
                  event.type === "TRANSFER" ? (
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground" />
                  );

                return (
                  <div
                    key={event.id}
                    className="rounded-lg border bg-muted/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {icon}
                          <span className="font-medium">{event.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{eventDateText}</span>
                        </div>
                      </div>
                      <Badge variant="outline">{event.status}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">By:</span> {event.actorName}
                        {event.actorContext && event.actorContext !== "-" ? ` (${event.actorContext})` : ""}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Context:</span> {event.contextLine}
                      </p>
                      {event.notes ? (
                        <p className="italic">
                          <span className="font-medium not-italic text-foreground">Notes:</span> {event.notes}
                        </p>
                      ) : null}
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
