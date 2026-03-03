import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { usePageSearch } from "@/contexts/PageSearchContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/useNotifications";
import { useSystemSettings } from "@/hooks/useSettings";
import {
  NOTIFICATION_AREA_DEFINITIONS,
  NOTIFICATION_TOGGLE_LABELS,
} from "@/config/notificationAreas";

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
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();
  const [readFilter, setReadFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: settingsData } = useSystemSettings();
  const settings = settingsData?.settings;

  const { data, isLoading } = useNotifications({
    page,
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

  const notifications = useMemo(() => data?.data || [], [data?.data]);
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const unreadCount = unreadMeta?.total || 0;

  useEffect(() => {
    setPage(1);
  }, [readFilter, searchTerm]);

  const filteredNotifications = useMemo(() => {
    if (!searchTerm) return notifications;
    return notifications.filter((notification) => {
      const haystack = `${notification.title} ${notification.message} ${notification.type}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [notifications, searchTerm]);

  return (
    <MainLayout
      title="Notification Details"
      description="All in-app notifications and coverage areas"
      searchPlaceholder="Search notifications..."
    >
      <PageHeader
        title="Notification Details"
        description="Track every in-app notification and see notification coverage by workflow"
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
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Unread: {unreadCount} | Total: {total}
                </CardDescription>
              </div>
              <Select
                value={readFilter}
                onValueChange={(value) => setReadFilter(value === "unread" ? "unread" : "all")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unread">Unread only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
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
                      filteredNotifications.map((notification) => (
                        <TableRow key={notification.id}>
                          <TableCell>
                            <Badge variant="outline">{toTitleCase(notification.type)}</Badge>
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markRead.mutate(notification.id)}
                              disabled={notification.is_read || markRead.isPending}
                            >
                              Mark read
                            </Button>
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
                Showing {filteredNotifications.length} notifications on this page
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coverage Areas</CardTitle>
            <CardDescription>
              Full list of areas where notifications should apply.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {NOTIFICATION_AREA_DEFINITIONS.map((area) => {
              const isEnabled = settings?.notifications?.[area.toggle];
              return (
                <div key={area.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{area.area}</p>
                    <Badge variant={area.status === "Live" ? "default" : "secondary"}>
                      {area.status}
                    </Badge>
                    <Badge variant={isEnabled ? "outline" : "secondary"}>
                      {NOTIFICATION_TOGGLE_LABELS[area.toggle]}: {isEnabled ? "ON" : "OFF"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{area.events}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{area.notes}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
