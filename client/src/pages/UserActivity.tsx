import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  ArrowRightLeft,
  Clock,
  Download,
  Eye,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Package,
  Search,
  Shield,
  ShieldAlert,
  Users,
} from "lucide-react";

import { MainLayout } from "@/components/layout/MainLayout";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";
import { TimelineList } from "@/components/shared/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { exportToCSV } from "@/lib/exportUtils";
import { useActivities } from "@/hooks/useActivities";

const activityIcons: Record<string, ElementType> = {
  login: LogIn,
  logout: LogOut,
  asset_created: Package,
  asset_updated: Package,
  asset_deleted: Package,
  assignment_created: Users,
  assignment_updated: Users,
  transfer_created: ArrowRightLeft,
  password_reset_request: ShieldAlert,
  user_role_changed: Shield,
  user_location_changed: MapPin,
  page_view: Eye,
};

const activityColors: Record<string, string> = {
  login: "bg-[hsl(102_43%_50%/.14)] text-[hsl(100_98%_22%)]",
  logout: "bg-[hsl(90_16%_75%/.22)] text-[hsl(92_7%_45%)]",
  asset_created: "bg-[hsl(var(--primary)/.14)] text-[hsl(var(--primary))]",
  asset_updated: "bg-[hsl(36_85%_52%/.16)] text-[hsl(30_92%_32%)]",
  asset_deleted: "bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]",
  assignment_created: "bg-[hsl(var(--accent)/.14)] text-[hsl(var(--accent))]",
  assignment_updated: "bg-[hsl(var(--accent)/.14)] text-[hsl(var(--accent))]",
  transfer_created: "bg-[hsl(98_45%_83%/.45)] text-[hsl(100_98%_22%)]",
  password_reset_request: "bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]",
  user_role_changed: "bg-[hsl(183_29%_32%/.14)] text-[hsl(183_29%_32%)]",
  user_location_changed: "bg-[hsl(102_43%_50%/.14)] text-[hsl(100_98%_22%)]",
  page_view: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
};

function getDeviceName(userAgent?: string | null) {
  if (!userAgent) return "Unknown";
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Safari")) return "Safari";
  if (userAgent.includes("Edge")) return "Edge";
  return "Unknown";
}

function formatActivityType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function UserActivity() {
  const pageSearch = usePageSearch();
  const searchQuery = pageSearch?.term || "";
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data, isLoading } = useActivities({
    search: searchQuery || undefined,
    activityType: activityFilter === "all" ? undefined : activityFilter,
  });
  const activities = useMemo(() => data ?? [], [data]);
  const totalActivities = activities.length;

  const filteredActivities = useMemo(
    () =>
      activities.filter((activity) => {
        const matchesUser = userFilter === "all" || activity.user_id === userFilter;
        const matchesDevice = deviceFilter === "all" || getDeviceName(activity.user_agent) === deviceFilter;
        return matchesUser && matchesDevice;
      }),
    [activities, userFilter, deviceFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
  const pagedActivities = useMemo(
    () => filteredActivities.slice((page - 1) * pageSize, page * pageSize),
    [filteredActivities, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, activityFilter, userFilter, deviceFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const uniqueActivityTypes = useMemo(
    () => [...new Set(activities.map((activity) => activity.activity_type))],
    [activities]
  );
  const uniqueUsers = useMemo(
    () =>
      Array.from(
        new Map(
          activities.map((activity) => [
            activity.user_id || "unknown",
            {
              id: activity.user_id || "unknown",
              label: activity.user_name || activity.user_email || "Unknown User",
            },
          ])
        ).values()
      ),
    [activities]
  );
  const uniqueDevices = useMemo(
    () => Array.from(new Set(activities.map((activity) => getDeviceName(activity.user_agent)))),
    [activities]
  );
  const todayActivities = useMemo(
    () =>
      activities.filter((activity) => {
        const activityDate = new Date(activity.created_at);
        const today = new Date();
        return activityDate.toDateString() === today.toDateString();
      }),
    [activities]
  );
  const loginCount = useMemo(
    () => activities.filter((activity) => activity.activity_type === "login").length,
    [activities]
  );
  const uniqueUsersCount = useMemo(
    () => new Set(activities.map((activity) => activity.user_id)).size,
    [activities]
  );
  const recentTimeline = useMemo(
    () =>
      filteredActivities.slice(0, 5).map((activity) => ({
        id: activity.id,
        title: formatActivityType(activity.activity_type),
        description: activity.user_name || activity.user_email || "Unknown user",
        meta: formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }),
        badge: getDeviceName(activity.user_agent),
        icon: activityIcons[activity.activity_type] || Activity,
      })),
    [filteredActivities]
  );

  const handleExportCSV = () => {
    exportToCSV(
      filteredActivities.map((activity) => ({
        timestamp: new Date(activity.created_at).toISOString(),
        activity: formatActivityType(activity.activity_type),
        userName: activity.user_name || "Unknown User",
        userEmail: activity.user_email || "",
        description: activity.description || "",
        device: getDeviceName(activity.user_agent),
      })),
      [
        { key: "timestamp", header: "Timestamp" },
        { key: "activity", header: "Activity" },
        { key: "userName", header: "User Name" },
        { key: "userEmail", header: "User Email" },
        { key: "description", header: "Description" },
        { key: "device", header: "Device" },
      ],
      `user-activity-${format(new Date(), "yyyy-MM-dd")}`
    );
  };
  const pageStart = pagedActivities.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, filteredActivities.length);

  return (
    <MainLayout title="User Activity" description="Monitor user activity logs">
      <CollectionWorkspace
        title="User Activity"
        description="Track user logins, actions, and system activity."
        eyebrow="Audit workspace"
        meta={
          <>
            <span>{totalActivities} recorded activities</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{uniqueUsersCount} active users in scope</span>
          </>
        }
        extra={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>
        }
        metrics={[
          { label: "Today's Activities", value: todayActivities.length, helper: "Recorded during the current day", icon: Activity, tone: "primary" },
          { label: "Total Logins", value: loginCount, helper: "Login events in this result scope", icon: LogIn, tone: "success" },
          { label: "Active Users", value: uniqueUsersCount, helper: "Distinct users in the current result set", icon: Users },
          { label: "Total Activities", value: totalActivities, helper: `${filteredActivities.length} rows after filters`, icon: Clock, tone: "warning" },
        ]}
        filterBar={
          <>
            <div className="relative w-full sm:max-w-sm sm:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(event) => pageSearch?.setTerm(event.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                {uniqueActivityTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatActivityType(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={deviceFilter} onValueChange={setDeviceFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by device" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Devices</SelectItem>
                {uniqueDevices.map((device) => (
                  <SelectItem key={device} value={device}>
                    {device}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        panelTitle="Activity Log"
        panelDescription="Search, filter, and review audit events using the same workspace shell as the dashboard and workflow pages."
        secondaryPanel={{
          title: "Recent Activity",
          description: "A compact audit timeline from the current filtered result set.",
          content: (
            <TimelineList
              items={recentTimeline}
              emptyTitle="No activity in scope"
              emptyDescription="Recent events will appear here once the selected filters return activity."
            />
          ),
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="table-shell">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActivities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No activities found
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedActivities.map((activity) => {
                    const Icon = activityIcons[activity.activity_type] || Activity;
                    return (
                      <TableRow key={activity.id}>
                        <TableCell>
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${activityColors[activity.activity_type] || "bg-muted"}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="table-pill">
                            {formatActivityType(activity.activity_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{activity.user_name || "Unknown User"}</p>
                            <p className="text-xs text-muted-foreground">{activity.user_email || "N/A"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {activity.description || "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{new Date(activity.created_at).toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p
                            className="max-w-[150px] overflow-hidden text-xs leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                            title={activity.user_agent || ""}
                          >
                            {getDeviceName(activity.user_agent)}
                          </p>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && totalActivities > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {pageStart} to {pageEnd} of {filteredActivities.length}
            </p>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
                Previous
              </Button>
              <span className="text-sm font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CollectionWorkspace>
    </MainLayout>
  );
}
