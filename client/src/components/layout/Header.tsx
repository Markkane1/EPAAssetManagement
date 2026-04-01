import { Bell, CalendarDays, LogOut, Menu, Search, Settings, User } from "lucide-react";
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
import { useMemo } from "react";
import { canAccessPage } from "@/config/pagePermissions";
import { useMarkAllNotificationsRead, useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  description?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onMenuClick?: () => void;
}

export function Header({
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onMenuClick,
}: HeaderProps) {
  const { user, role, activeRole, isOrgAdmin, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const canAccessSettings = canAccessPage({
    page: "settings",
    role,
    isOrgAdmin,
  });
  const formatRoleLabel = (value?: string | null) => {
    const normalized = String(value || "").trim().toLowerCase();
    switch (normalized) {
      case "org_admin":
        return "Administrator";
      case "head_office_admin":
        return "Head Office Admin";
      case "office_head":
        return "Office Head";
      case "caretaker":
        return "Caretaker";
      case "employee":
        return "Employee";
      default:
        return normalized
          ? normalized
              .split(/[_-\s]+/)
              .filter(Boolean)
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" ")
          : "User";
    }
  };
  const roleLabel = formatRoleLabel(activeRole || role);
  const currentDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date()),
    []
  );

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "U";

  const { data: notificationResponse, isLoading: notificationsLoading } = useNotifications({
    page: 1,
    limit: 20,
    scopeKey: user?.id || "anon",
    enabled: !isLoading && isAuthenticated && Boolean(user?.id),
  });
  const notifications = useMemo(
    () => notificationResponse?.data || [],
    [notificationResponse?.data]
  );
  const markAllNotificationsRead = useMarkAllNotificationsRead();

  const unreadCount = useMemo(() => {
    return notifications.filter((notification) => !notification.is_read).length;
  }, [notifications]);

  const markAllRead = () => {
    if (unreadCount <= 0 || markAllNotificationsRead.isPending) return;
    markAllNotificationsRead.mutate();
  };

  return (
    <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5 sm:pt-4 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 rounded-[1.75rem] border border-border/70 bg-card/88 px-4 py-4 shadow-[0_18px_60px_-40px_rgba(26,28,24,0.14)] backdrop-blur sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {onMenuClick && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onMenuClick}
                className="mt-0.5 h-10 w-10 rounded-2xl md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Operations Workspace</Badge>
                <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {currentDateLabel}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xl font-semibold tracking-tight text-foreground break-words sm:text-2xl">
                  {title}
                </div>
                {description && (
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[420px] lg:items-end">
            {onSearchChange && (
              <div className="relative hidden w-full md:block lg:max-w-md">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder || "Search this page..."}
                  value={searchValue || ""}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="hidden min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-3 py-2 lg:flex">
                <div className="min-w-0">
                  <p className="max-w-[18rem] break-all text-sm font-medium leading-5 text-foreground">{user?.email || "User"}</p>
                  <p className="text-xs text-muted-foreground">Role: {roleLabel}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (open) {
                      markAllRead();
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-2xl text-muted-foreground hover:text-foreground">
                      <Bell className="h-5 w-5" />
                      {unreadCount > 0 && (
                        <Badge className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] tracking-normal text-destructive-foreground">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] max-w-80">
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
                      notifications.map((notification) => (
                        <DropdownMenuItem
                          key={notification.id}
                          className="flex flex-col items-start gap-1 py-3"
                          onClick={() => navigate("/settings/notifications")}
                        >
                          <span className="font-medium">{notification.title}</span>
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {notification.message}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(notification.created_at).toLocaleString()}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="justify-center text-center font-medium text-primary"
                      onClick={() => navigate("/settings/notifications")}
                    >
                      View all notifications
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-2xl">
                      <Avatar className="h-10 w-10 border border-border/80">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">{initials}</AvatarFallback>
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
          </div>
        </div>

        {onSearchChange && (
          <div className="relative md:hidden">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder || "Search this page..."}
              value={searchValue || ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className={cn("pl-10")}
            />
          </div>
        )}
      </div>
    </header>
  );
}

