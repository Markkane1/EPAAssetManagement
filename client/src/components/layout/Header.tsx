import { Bell, Search, HelpCircle, LogOut, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { activityService, ActivityLogWithUser } from "@/services/activityService";

interface HeaderProps {
  title: string;
  description?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

const LAST_SEEN_KEY = "ams.notifications.lastSeenAt";

export function Header({
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: HeaderProps) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [lastSeenAt, setLastSeenAt] = useState(() => localStorage.getItem(LAST_SEEN_KEY));
  const canAccessSettings = role !== "employee" && role !== "directorate_head" && role !== "location_admin";
  const roleLabel = (() => {
    switch (role) {
      case "super_admin":
        return "Super Admin";
      case "admin":
        return "Administrator";
      case "location_admin":
        return "Location Admin";
      case "caretaker":
        return "Caretaker";
      case "assistant_caretaker":
        return "Assistant Caretaker";
      case "user":
        return "User";
      case "employee":
        return "Employee";
      case "directorate_head":
        return "Directorate Head";
      case "viewer":
        return "Viewer";
      default:
        return "User";
    }
  })();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "U";

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => activityService.getUserActivities(user?.id || "", 20),
    enabled: !!user?.id,
  });

  const unreadCount = useMemo(() => {
    if (!lastSeenAt) return notifications.length;
    const lastSeenDate = new Date(lastSeenAt);
    return notifications.filter((activity) => new Date(activity.created_at) > lastSeenDate).length;
  }, [notifications, lastSeenAt]);

  const markAllRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, now);
    setLastSeenAt(now);
  };

  const formatNotificationTitle = (activity: ActivityLogWithUser) => {
    if (activity.description) return activity.description;
    const type = activity.activity_type.replace(/_/g, " ");
    return `${activity.user_name || activity.user_email || "User"} ${type}`;
  };

  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Page Title */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder || "Search this page..."}
              value={searchValue || ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="w-64 pl-9 bg-muted/50 border-0 focus-visible:ring-1"
            />
          </div>

          {/* Help */}
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-5 w-5" />
          </Button>

          {/* Notifications */}
          <DropdownMenu onOpenChange={(open) => {
            if (open) {
              markAllRead();
            }
          }}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notificationsLoading && (
                <DropdownMenuItem className="text-sm text-muted-foreground">
                  Loading notifications...
                </DropdownMenuItem>
              )}
              {!notificationsLoading && notifications.length === 0 && (
                <DropdownMenuItem className="text-sm text-muted-foreground">
                  No notifications yet.
                </DropdownMenuItem>
              )}
              {!notificationsLoading &&
                notifications.map((activity) => (
                  <DropdownMenuItem key={activity.id} className="flex flex-col items-start gap-1 py-3">
                    <span className="font-medium">{formatNotificationTitle(activity)}</span>
                    <span className="text-sm text-muted-foreground">
                      {activity.user_name || activity.user_email || "System"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-center justify-center text-primary font-medium"
                onClick={() => navigate("/user-activity")}
              >
                View all notifications
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.email || "User"}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              {canAccessSettings && (
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
