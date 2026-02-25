import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  Activity,
  Download,
  LogIn,
  LogOut,
  Package,
  Users,
  ArrowRightLeft,
  Shield,
  ShieldAlert,
  MapPin,
  Loader2,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { activityService } from "@/services/activityService";
import { format, formatDistanceToNow } from "date-fns";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { exportToCSV, exportToExcel } from "@/lib/exportUtils";

const activityIcons: Record<string, React.ElementType> = {
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
  login: "bg-green-500/10 text-green-500",
  logout: "bg-slate-500/10 text-slate-500",
  asset_created: "bg-blue-500/10 text-blue-500",
  asset_updated: "bg-yellow-500/10 text-yellow-500",
  asset_deleted: "bg-red-500/10 text-red-500",
  assignment_created: "bg-purple-500/10 text-purple-500",
  assignment_updated: "bg-purple-500/10 text-purple-500",
  transfer_created: "bg-orange-500/10 text-orange-500",
  password_reset_request: "bg-red-500/10 text-red-500",
  user_role_changed: "bg-indigo-500/10 text-indigo-500",
  user_location_changed: "bg-teal-500/10 text-teal-500",
  page_view: "bg-gray-500/10 text-gray-500",
};

export default function UserActivity() {
  const pageSearch = usePageSearch();
  const searchQuery = pageSearch?.term || "";
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data, isLoading } = useQuery({
    queryKey: ["user-activities", page, pageSize, searchQuery, activityFilter],
    queryFn: () =>
      activityService.getPagedActivities({
        page,
        limit: pageSize,
        search: searchQuery || undefined,
        activityType: activityFilter === "all" ? undefined : activityFilter,
      }),
  });
  const activities = useMemo(() => data?.items ?? [], [data?.items]);
  const totalActivities = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalActivities / pageSize));

  useEffect(() => {
    setPage(1);
  }, [searchQuery, activityFilter, pageSize]);

  const getDeviceName = (userAgent?: string | null) => {
    if (!userAgent) return "Unknown";
    if (userAgent.includes("Chrome")) return "Chrome";
    if (userAgent.includes("Firefox")) return "Firefox";
    if (userAgent.includes("Safari")) return "Safari";
    if (userAgent.includes("Edge")) return "Edge";
    return "Unknown";
  };

  const filteredActivities = useMemo(
    () =>
      activities.filter((activity) => {
        const matchesUser = userFilter === "all" || activity.user_id === userFilter;
        const matchesDevice = deviceFilter === "all" || getDeviceName(activity.user_agent) === deviceFilter;
        return matchesUser && matchesDevice;
      }),
    [activities, userFilter, deviceFilter]
  );

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

  const getActivityIcon = (type: string) => {
    const Icon = activityIcons[type] || Activity;
    return Icon;
  };

  const formatActivityType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Get stats
  const todayActivities = useMemo(() => {
    return activities.filter((activity) => {
      const activityDate = new Date(activity.created_at);
      const today = new Date();
      return activityDate.toDateString() === today.toDateString();
    });
  }, [activities]);

  const loginCount = useMemo(
    () => activities.filter((activity) => activity.activity_type === "login").length,
    [activities]
  );
  const uniqueUsersCount = useMemo(
    () => new Set(activities.map((activity) => activity.user_id)).size,
    [activities]
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

  const handleExportExcel = async () => {
    await exportToExcel(
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

  return (
    <MainLayout title="User Activity" description="Monitor user activity logs">
      <PageHeader
        title="User Activity"
        description="Track user logins, actions, and system activity"
        extra={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleExportExcel()}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Activities</p>
                <p className="text-2xl font-bold">{todayActivities.length}</p>
              </div>
              <Activity className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Logins</p>
                <p className="text-2xl font-bold">{loginCount}</p>
              </div>
              <LogIn className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{uniqueUsersCount}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Activities</p>
                <p className="text-2xl font-bold">{totalActivities}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => pageSearch?.setTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-[200px]">
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
              <SelectTrigger className="w-[220px]">
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
              <SelectTrigger className="w-[180px]">
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
          </div>

          {/* Activity Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
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
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No activities found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActivities.map((activity) => {
                      const Icon = getActivityIcon(activity.activity_type);
                      return (
                        <TableRow key={activity.id}>
                          <TableCell>
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${activityColors[activity.activity_type] || 'bg-muted'}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {formatActivityType(activity.activity_type)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {activity.user_name || 'Unknown User'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {activity.user_email || '—'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {activity.description || '—'}
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
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]" title={activity.user_agent || ''}>
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
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredActivities.length} on this page ({totalActivities} total)
              </p>
              <div className="flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="100">100 / page</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
