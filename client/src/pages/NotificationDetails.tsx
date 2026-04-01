import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { MainLayout } from "@/components/layout/MainLayout";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSearch } from "@/contexts/PageSearchContext";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationAction,
  useAllNotifications,
  useNotifications,
} from "@/hooks/useNotifications";
import { useSystemSettings } from "@/hooks/useSettings";
import {
  NOTIFICATION_AREA_DEFINITIONS,
  NOTIFICATION_TOGGLE_LABELS,
} from "@/config/notificationAreas";
import { toast } from "sonner";

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function NotificationDetails() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();
  const [readFilter, setReadFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: settingsData } = useSystemSettings();
  const settings = settingsData?.settings;

  const { data, isLoading } = useAllNotifications({
    limit,
    unreadOnly: readFilter === "unread",
    scopeKey: user?.id || "anon",
    enabled: Boolean(user?.id),
  });
  const { data: unreadMeta } = useNotifications({
    page: 1,
    limit: 1,
    unreadOnly: true,
    scopeKey: user?.id || "anon",
    enabled: Boolean(user?.id),
  });
  const markAllRead = useMarkAllNotificationsRead();
  const markRead = useMarkNotificationRead();
  const runNotificationAction = useNotificationAction();

  const notifications = useMemo(() => data || [], [data]);
  const total = notifications.length;
  const unreadCount = unreadMeta?.total || 0;
  const enabledCoverageAreas = useMemo(
    () =>
      NOTIFICATION_AREA_DEFINITIONS.filter((area) => settings?.notifications?.[area.toggle]).length,
    [settings?.notifications]
  );
  const filteredNotifications = useMemo(() => {
    if (!searchTerm) return notifications;
    return notifications.filter((notification) => {
      const haystack = `${notification.title} ${notification.message} ${notification.type}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [notifications, searchTerm]);
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / limit));
  const pagedNotifications = useMemo(
    () => filteredNotifications.slice((page - 1) * limit, page * limit),
    [filteredNotifications, limit, page]
  );

  useEffect(() => {
    setPage(1);
  }, [readFilter, searchTerm]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <MainLayout
      title="Notification Details"
      description="All in-app notifications and coverage areas"
      searchPlaceholder="Search notifications..."
    >
      <CollectionWorkspace
        title="Notification Details"
        description="Track every in-app notification and review workflow coverage using the same operational workspace pattern as the rest of the app."
        eyebrow="Workflow coverage"
        meta={
          <>
            <span>{unreadCount} unread notifications</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{enabledCoverageAreas} enabled notification areas</span>
          </>
        }
        extra={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending || unreadCount === 0}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        }
        metrics={[
          { label: "Unread", value: unreadCount, helper: "Currently awaiting review", icon: Bell, tone: "warning" },
          { label: "Total Notifications", value: total, helper: "Server-side records in scope", icon: Bell, tone: "primary" },
          { label: "Visible On Page", value: filteredNotifications.length, helper: `Filter mode: ${readFilter === "unread" ? "Unread only" : "All"}`, icon: CheckCheck },
          { label: "Coverage Areas", value: enabledCoverageAreas, helper: "Notification toggles currently enabled", icon: Bell, tone: "success" },
        ]}
        filterBar={
          <>
            <div className="text-sm text-muted-foreground">
              Unread: {unreadCount} | Total: {total}
            </div>
            <Select
              value={readFilter}
              onValueChange={(value) => setReadFilter(value === "unread" ? "unread" : "all")}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread only</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        panelTitle="Notifications"
        panelDescription="Review notification records, mark items as read, and execute supported actions."
        secondaryPanel={{
          title: "Coverage Areas",
          description: "Notification areas and toggle coverage across the application.",
          content: (
            <div className="space-y-3">
              {NOTIFICATION_AREA_DEFINITIONS.map((area) => {
                const isEnabled = settings?.notifications?.[area.toggle];
                return (
                  <div key={area.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{area.area}</p>
                      <Badge variant={area.status === "Live" ? "default" : "secondary"}>
                        {area.status}
                      </Badge>
                      <Badge variant={isEnabled ? "outline" : "secondary"}>
                        {NOTIFICATION_TOGGLE_LABELS[area.toggle]}: {isEnabled ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{area.events}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{area.notes}</p>
                  </div>
                );
              })}
            </div>
          ),
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="table-shell overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No notifications found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedNotifications.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell>
                        <Badge variant="outline" className="table-pill">
                          {toTitleCase(notification.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{notification.title}</TableCell>
                      <TableCell className="max-w-[300px] whitespace-normal text-muted-foreground">
                        {notification.message}
                      </TableCell>
                      <TableCell>
                        <Badge variant={notification.is_read ? "secondary" : "default"}>
                          {notification.is_read ? "Read" : "Unread"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div>{new Date(notification.created_at).toLocaleString()}</div>
                        <div className="text-xs">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {!notification.is_read && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markRead.mutate(notification.id)}
                              disabled={markRead.isPending}
                            >
                              Mark read
                            </Button>
                          )}
                          {(notification.available_actions || []).includes("ACKNOWLEDGE") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                runNotificationAction.mutate(
                                  { id: notification.id, action: "ACKNOWLEDGE" },
                                  { onError: (error) => toast.error(error.message) }
                                )
                              }
                              disabled={runNotificationAction.isPending}
                            >
                              Acknowledge
                            </Button>
                          )}
                          {(notification.available_actions || []).includes("APPROVE") && (
                            <Button
                              size="sm"
                              onClick={() =>
                                runNotificationAction.mutate(
                                  { id: notification.id, action: "APPROVE" },
                                  {
                                    onSuccess: () => toast.success("Approved"),
                                    onError: (error) => toast.error(error.message),
                                  }
                                )
                              }
                              disabled={runNotificationAction.isPending}
                            >
                              Approve
                            </Button>
                          )}
                          {(notification.available_actions || []).includes("REJECT") && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                runNotificationAction.mutate(
                                  { id: notification.id, action: "REJECT" },
                                  {
                                    onSuccess: () => toast.success("Rejected"),
                                    onError: (error) => toast.error(error.message),
                                  }
                                )
                              }
                              disabled={runNotificationAction.isPending}
                            >
                              Reject
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              runNotificationAction.mutate(
                                { id: notification.id, action: "OPEN_RECORD" },
                                {
                                  onSuccess: (result) => {
                                    if (result.openPath) {
                                      navigate(result.openPath);
                                      return;
                                    }
                                    if (notification.open_path) navigate(notification.open_path);
                                  },
                                  onError: (error) => {
                                    if (notification.open_path) {
                                      navigate(notification.open_path);
                                      return;
                                    }
                                    toast.error(error.message);
                                  },
                                }
                              );
                            }}
                            disabled={runNotificationAction.isPending}
                          >
                            Open record
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {pagedNotifications.length === 0 ? 0 : (page - 1) * limit + 1} to{" "}
            {Math.min(page * limit, filteredNotifications.length)} of {filteredNotifications.length} notifications
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CollectionWorkspace>
    </MainLayout>
  );
}
