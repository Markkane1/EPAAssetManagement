import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UserPlus,
  Wrench,
  Package,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecentActivity } from "@/hooks/useDashboard";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  id: string;
  type: "assignment" | "maintenance" | "new_asset";
  title: string;
  description: string;
  time: string;
  user: string;
}

const activityIcons = {
  assignment: UserPlus,
  maintenance: Wrench,
  new_asset: Package,
};

const activityColors = {
  assignment: "bg-info/10 text-info",
  maintenance: "bg-warning/10 text-warning",
  new_asset: "bg-success/10 text-success",
};

export function RecentActivity() {
  const { data = [] } = useRecentActivity(8);

  const activities: Activity[] = data.map((activity) => {
    const timestamp = activity.timestamp ? new Date(activity.timestamp) : new Date();
    const time = formatDistanceToNow(timestamp, { addSuffix: true });
    const titleMap: Record<string, string> = {
      assignment: "Asset Assigned",
      maintenance: "Maintenance Updated",
      new_asset: "New Asset Added",
    };

    const safeType = activity.type in titleMap ? (activity.type as Activity["type"]) : "assignment";

    return {
      id: activity.id,
      type: safeType,
      title: titleMap[safeType] || "Activity",
      description: activity.description,
      time,
      user: activity.user || "System",
    };
  });

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No recent activity
          </p>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type];
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className={cn("rounded-lg p-2", activityColors[activity.type])}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{activity.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{activity.time}</span>
                      <span className="text-xs text-muted-foreground">-</span>
                      <span className="text-xs text-muted-foreground">{activity.user}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
