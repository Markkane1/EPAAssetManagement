import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { activityService, ActivityLogWithUser } from "@/services/activityService";
import { formatDistanceToNow } from "date-fns";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<string>("all");

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["user-activities"],
    queryFn: () => activityService.getRecentActivities(100),
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      const matchesSearch =
        activity.user_email?.toLowerCase().includes(normalizedSearch) ||
        activity.user_name?.toLowerCase().includes(normalizedSearch) ||
        activity.description?.toLowerCase().includes(normalizedSearch) ||
        activity.activity_type.toLowerCase().includes(normalizedSearch);

      const matchesFilter = activityFilter === "all" || activity.activity_type === activityFilter;

      return matchesSearch && matchesFilter;
    });
  }, [activities, activityFilter, normalizedSearch]);

  const uniqueActivityTypes = useMemo(
    () => [...new Set(activities.map((activity) => activity.activity_type))],
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
  const uniqueUsers = useMemo(
    () => new Set(activities.map((activity) => activity.user_id)).size,
    [activities]
  );

  return (
    <MainLayout title="User Activity" description="Monitor user activity logs">
      <PageHeader
        title="User Activity"
        description="Track user logins, actions, and system activity"
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
                <p className="text-2xl font-bold">{uniqueUsers}</p>
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
                <p className="text-2xl font-bold">{activities.length}</p>
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
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                              {activity.user_agent?.includes('Chrome') ? 'Chrome' :
                               activity.user_agent?.includes('Firefox') ? 'Firefox' :
                               activity.user_agent?.includes('Safari') ? 'Safari' :
                               activity.user_agent?.includes('Edge') ? 'Edge' :
                               'Unknown'}
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
        </CardContent>
      </Card>
    </MainLayout>
  );
}
