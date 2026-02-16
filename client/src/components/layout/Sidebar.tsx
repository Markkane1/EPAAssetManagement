import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  PackageOpen,
  Users,
  MapPin,
  FolderTree,
  Building2,
  Wrench,
  ClipboardList,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Truck,
  FolderKanban,
  Layers,
  ArrowRightLeft,
  ShoppingCart,
  Shield,
  UserCog,
  Crown,
  Activity,
  Trash2,
  Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import epaLogo from "@/assets/epa-logo.jpg";
import { useAuth } from "@/contexts/AuthContext";
import type { AppPageKey } from "@/config/pagePermissions";
import { canAccessPage } from "@/config/pagePermissions";

const SIDEBAR_SCROLL_KEY = "epaams.sidebar.scrollTop";
const SIDEBAR_LAST_CLICKED_KEY = "epaams.sidebar.lastClickedHref";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  page: AppPageKey;
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, page: "dashboard" },
  { label: "Inventory & Assignments", href: "/inventory", icon: Layers, page: "inventory" },
];

const managementNavItems: NavItem[] = [
  { label: "Employees", href: "/employees", icon: Users, page: "employees" },
  { label: "Offices", href: "/offices", icon: MapPin, page: "offices" },
  { label: "Categories", href: "/categories", icon: FolderTree, page: "categories" },
  { label: "Vendors", href: "/vendors", icon: Truck, page: "vendors" },
  { label: "Projects", href: "/projects", icon: FolderKanban, page: "projects" },
  { label: "Schemes", href: "/schemes", icon: Layers, page: "schemes" },
  { label: "Purchase Orders", href: "/purchase-orders", icon: ShoppingCart, page: "purchase-orders" },
];

const systemNavItems: NavItem[] = [
  { label: "Audit Logs", href: "/audit-logs", icon: Shield, page: "audit-logs" },
  { label: "Settings", href: "/settings", icon: Settings, page: "settings" },
];

const reportsRootItem: NavItem = { label: "Reports", href: "/reports", icon: FileText, page: "reports" };

const reportNavItems: NavItem[] = [
  { label: "Overview", href: "/reports", icon: FileText, page: "reports" },
  { label: "Compliance", href: "/compliance", icon: Shield, page: "compliance" },
  { label: "Asset Summary", href: "/reports/asset-summary", icon: FileText, page: "reports" },
  { label: "Asset Items Inventory", href: "/reports/asset-items-inventory", icon: FileText, page: "reports" },
  { label: "Assignment Summary", href: "/reports/assignment-summary", icon: FileText, page: "reports" },
  { label: "Status Distribution", href: "/reports/status-distribution", icon: FileText, page: "reports" },
  { label: "Maintenance Report", href: "/reports/maintenance-report", icon: FileText, page: "reports" },
  { label: "Location Inventory", href: "/reports/location-inventory", icon: FileText, page: "reports" },
  { label: "Financial Summary", href: "/reports/financial-summary", icon: FileText, page: "reports" },
  { label: "Employee Assets", href: "/reports/employee-assets", icon: FileText, page: "reports" },
];

const movableAssetsRootItem: NavItem = { label: "Movable Assets", href: "/assets", icon: Package, page: "assets" };
const movableAssetsNavItems: NavItem[] = [
  { label: "Assets", href: "/assets", icon: Package, page: "assets" },
  { label: "Asset Items", href: "/asset-items", icon: PackageOpen, page: "asset-items" },
  { label: "Assignments", href: "/assignments", icon: ClipboardList, page: "assignments" },
  { label: "Requisitions", href: "/requisitions", icon: ClipboardList, page: "requisitions" },
  { label: "New Requisition", href: "/requisitions/new", icon: ClipboardList, page: "requisitions-new" },
  { label: "Return Requests", href: "/returns", icon: ArrowRightLeft, page: "returns" },
  { label: "New Return Request", href: "/returns/new", icon: ArrowRightLeft, page: "returns-new" },
  { label: "Transfers", href: "/transfers", icon: ArrowRightLeft, page: "transfers" },
  { label: "Maintenance", href: "/maintenance", icon: Wrench, page: "maintenance" },
];


const consumablesRootItem: NavItem = { label: "Consumables", href: "/consumables", icon: Layers, page: "consumables" };
const consumableNavItems: NavItem[] = [
  { label: "Master Register", href: "/consumables", icon: Layers, page: "consumables" },
  { label: "Locations", href: "/consumables/locations", icon: MapPin, page: "consumables" },
  { label: "Lot Receiving", href: "/consumables/receive", icon: PackageOpen, page: "consumables" },
  { label: "Lots", href: "/consumables/lots", icon: PackageOpen, page: "consumables" },
  { label: "Units", href: "/consumables/units", icon: Ruler, page: "consumables" },
  { label: "Inventory", href: "/consumables/inventory", icon: Package, page: "consumables" },
  { label: "Transfers", href: "/consumables/transfers", icon: ArrowRightLeft, page: "consumables" },
  { label: "Consumption", href: "/consumables/consume", icon: ClipboardList, page: "consumables" },
  { label: "Adjustments", href: "/consumables/adjustments", icon: Wrench, page: "consumables" },
  { label: "Disposal", href: "/consumables/disposal", icon: Trash2, page: "consumables" },
  { label: "Returns", href: "/consumables/returns", icon: ArrowRightLeft, page: "consumables" },
  { label: "Ledger", href: "/consumables/ledger", icon: FileText, page: "consumables" },
  { label: "Expiry", href: "/consumables/expiry", icon: Activity, page: "consumables" },
];

const managementRootItem: NavItem = { label: "Management", href: "/employees", icon: Building2, page: "employees" };

const authManagementRootItem: NavItem = { label: "Auth Management", href: "/user-management", icon: Shield, page: "user-management" };
const authManagementNavItems: NavItem[] = [
  { label: "User Management", href: "/user-management", icon: Users, page: "user-management" },
  { label: "User Activity", href: "/user-activity", icon: Activity, page: "user-activity" },
  { label: "User Permissions", href: "/user-permissions", icon: UserCog, page: "user-permissions" },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [movableOpen, setMovableOpen] = useState(
    location.pathname.startsWith("/assets") ||
      location.pathname.startsWith("/asset-items") ||
      location.pathname.startsWith("/assignments") ||
      location.pathname.startsWith("/requisitions") ||
      location.pathname.startsWith("/returns") ||
      location.pathname.startsWith("/transfers") ||
      location.pathname.startsWith("/maintenance")
  );
  const [consumablesOpen, setConsumablesOpen] = useState(location.pathname.startsWith("/consumables"));
  const [reportsOpen, setReportsOpen] = useState(
    location.pathname.startsWith("/reports") || location.pathname.startsWith("/compliance")
  );
  const [authOpen, setAuthOpen] = useState(location.pathname.startsWith("/user-management") || location.pathname.startsWith("/user-activity") || location.pathname.startsWith("/user-permissions"));
  const [managementOpen, setManagementOpen] = useState(
    location.pathname.startsWith("/employees") ||
      location.pathname.startsWith("/offices") ||
      location.pathname.startsWith("/categories") ||
      location.pathname.startsWith("/vendors") ||
      location.pathname.startsWith("/projects") ||
      location.pathname.startsWith("/schemes") ||
      location.pathname.startsWith("/purchase-orders")
  );
  const { user, role, isOrgAdmin } = useAuth();

  const navRef = useRef<HTMLElement>(null);

  // Restore sidebar scroll position on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved && navRef.current) {
      navRef.current.scrollTop = Number(saved) || 0;
    }
  }, []);

  // After navigation, ensure the active (or last-clicked) item stays in view
  useEffect(() => {
    const href = sessionStorage.getItem(SIDEBAR_LAST_CLICKED_KEY) || location.pathname;
    const el = navRef.current?.querySelector(`[data-nav-href="${href}"]`);
    if (el) {
      // Keep the clicked/active item visible (do NOT jump the whole sidebar to top)
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith("/reports") || location.pathname.startsWith("/compliance")) {
      setReportsOpen(true);
    }
    if (
      location.pathname.startsWith("/user-management") ||
      location.pathname.startsWith("/user-activity") ||
      location.pathname.startsWith("/user-permissions")
    ) {
      setAuthOpen(true);
    }
    if (
      location.pathname.startsWith("/employees") ||
      location.pathname.startsWith("/offices") ||
      location.pathname.startsWith("/categories") ||
      location.pathname.startsWith("/vendors") ||
      location.pathname.startsWith("/projects") ||
      location.pathname.startsWith("/schemes") ||
      location.pathname.startsWith("/purchase-orders")
    ) {
      setManagementOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (
      location.pathname.startsWith("/assets") ||
      location.pathname.startsWith("/asset-items") ||
      location.pathname.startsWith("/assignments") ||
      location.pathname.startsWith("/requisitions") ||
      location.pathname.startsWith("/returns") ||
      location.pathname.startsWith("/transfers") ||
      location.pathname.startsWith("/maintenance")
  ) {
      setMovableOpen(true);
    }
    if (
      location.pathname.startsWith("/consumables")
    ) {
      setConsumablesOpen(true);
    }
  }, [location.pathname]);

  const filterItems = (items: NavItem[]) => {
    return items.filter((item) => {
      return canAccessPage({ page: item.page, role, isOrgAdmin });
    });
  };

  const getUserInitials = () => {
    if (!user?.email) return "U";
    return user.email.charAt(0).toUpperCase();
  };

  const getRoleLabel = () => {
    if (isOrgAdmin) return "Org Admin";
    switch (role) {
      case 'office_head': return "Office Head";
      case 'caretaker': return "Caretaker";
      case 'employee': return "Employee";
      default: return "User";
    }
  };

  const NavLink = ({ item, className: linkClassName }: { item: NavItem; className?: string }) => {
    const isActive = location.pathname === item.href;
    const Icon = item.icon;

    const linkContent = (
      <Button
        variant={isActive ? "secondary" : "ghost"}
        size={collapsed ? "icon" : "sm"}
        className={cn("w-full", collapsed ? "justify-center" : "justify-start", linkClassName)}
        asChild
      >
        <Link
          to={item.href}
          data-nav-href={item.href}
          onClick={(e) => {
            // Persist sidebar scroll so it doesn't reset on route change
            if (navRef.current) {
              sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(navRef.current.scrollTop));
            }
            sessionStorage.setItem(SIDEBAR_LAST_CLICKED_KEY, item.href);

            // Avoid focus jump
            e.currentTarget.blur();
          }}
        >
          <Icon className={cn("h-4 w-4 shrink-0", !collapsed && "mr-2")} />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {!collapsed && item.badge && (
            <span className="ml-auto bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
              {item.badge}
            </span>
          )}
        </Link>
      </Button>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <aside
      className={cn(
        "shrink-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img 
                src={epaLogo} 
                alt="EPA Logo" 
                className="h-10 w-10 rounded-lg object-contain bg-white"
              />
              <span className="font-semibold text-sidebar-foreground">EPA AMS</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav
          ref={navRef}
          onScroll={(e) => {
            sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String((e.currentTarget as HTMLElement).scrollTop));
          }}
          className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6 scrollbar-thin"
        >
          {/* Main */}
          {(() => {
            const items = filterItems(mainNavItems);
            const movableItems = filterItems(movableAssetsNavItems);
            const consumableItems = filterItems(consumableNavItems);
            const showMovable = movableItems.length > 0;
            const showConsumables = consumableItems.length > 0;
            const isMovableActive =
              location.pathname.startsWith("/assets") ||
              location.pathname.startsWith("/asset-items") ||
              location.pathname.startsWith("/assignments") ||
              location.pathname.startsWith("/requisitions") ||
              location.pathname.startsWith("/returns") ||
              location.pathname.startsWith("/transfers") ||
              location.pathname.startsWith("/maintenance");
            const isConsumablesActive =
      location.pathname.startsWith("/consumables");
            if (items.length === 0 && !showMovable && !showConsumables) return null;
            const dashboardItem = items.find((item) => item.href === "/");
            const remainingItems = items.filter((item) => item.href !== "/");
            return (
              <div className="space-y-1">
                {dashboardItem && <NavLink item={dashboardItem} />}
                {showMovable && !collapsed && (
                  <Collapsible open={movableOpen} onOpenChange={setMovableOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant={isMovableActive ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Package className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">Movable Assets</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 transition-transform",
                            movableOpen && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1">
                      {movableItems.map((item) => (
                        <NavLink key={item.href} item={item} className="pl-6" />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {showMovable && collapsed && <NavLink item={movableAssetsRootItem} />}
                {showConsumables && !collapsed && (
                  <Collapsible open={consumablesOpen} onOpenChange={setConsumablesOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant={isConsumablesActive ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Layers className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">Consumables</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 transition-transform",
                            consumablesOpen && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1">
                      {consumableItems.map((item) => (
                        <NavLink key={item.href} item={item} className="pl-6" />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {showConsumables && collapsed && <NavLink item={consumablesRootItem} />}
                {remainingItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            );
          })()}

          {/* Management */}
          {(() => {
            const items = filterItems(managementNavItems);
            const showManagement = items.length > 0;
            const isManagementActive =
              location.pathname.startsWith("/employees") ||
              location.pathname.startsWith("/offices") ||
              location.pathname.startsWith("/categories") ||
              location.pathname.startsWith("/vendors") ||
              location.pathname.startsWith("/projects") ||
              location.pathname.startsWith("/schemes") ||
              location.pathname.startsWith("/purchase-orders");
            if (!showManagement) return null;
            return (
              <div className="space-y-1">
                {!collapsed && (
                  <Collapsible open={managementOpen} onOpenChange={setManagementOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant={isManagementActive ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Building2 className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">Management</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 transition-transform",
                            managementOpen && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1">
                      {items.map((item) => (
                        <NavLink key={item.href} item={item} className="pl-6" />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {collapsed && <NavLink item={managementRootItem} />}
              </div>
            );
          })()}

          {/* System */}
          {(() => {
            const items = filterItems(systemNavItems);
            const reportItems = filterItems(reportNavItems);
            const showReports = reportItems.length > 0;
            const isReportsActive =
              location.pathname.startsWith("/reports") || location.pathname.startsWith("/compliance");
            const authItems = filterItems(authManagementNavItems);
            const showAuth = authItems.length > 0;
            const isAuthActive =
              location.pathname.startsWith("/user-management") ||
              location.pathname.startsWith("/user-activity") ||
              location.pathname.startsWith("/user-permissions");
            if (items.length === 0 && !showReports) return null;
            return (
              <div className="space-y-1">
                {!collapsed && (
                  <p className="px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
                    System
                  </p>
                )}
                {showAuth && !collapsed && (
                  <Collapsible open={authOpen} onOpenChange={setAuthOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant={isAuthActive ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Shield className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">Auth Management</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 transition-transform",
                            authOpen && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1">
                      {authItems.map((item) => (
                        <NavLink key={item.href} item={item} className="pl-6" />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {showAuth && collapsed && <NavLink item={authManagementRootItem} />}
                {showReports && !collapsed && (
                  <Collapsible open={reportsOpen} onOpenChange={setReportsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant={isReportsActive ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                      >
                        <FileText className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">Reports</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 transition-transform",
                            reportsOpen && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1">
                      {reportItems.map((item) => (
                        <NavLink key={item.href} item={item} className="pl-6" />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {showReports && collapsed && <NavLink item={reportsRootItem} />}
                {items.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            );
          })()}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          {!collapsed ? (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center font-medium text-sm",
                isOrgAdmin 
                  ? "bg-yellow-500 text-yellow-950" 
                  : "bg-sidebar-primary text-sidebar-primary-foreground"
              )}>
                {isOrgAdmin ? <Crown className="h-4 w-4" /> : getUserInitials()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">{getRoleLabel()}</p>
              </div>
            </div>
          ) : (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center font-medium text-sm cursor-pointer",
                    isOrgAdmin 
                      ? "bg-yellow-500 text-yellow-950" 
                      : "bg-sidebar-primary text-sidebar-primary-foreground"
                  )}>
                    {isOrgAdmin ? <Crown className="h-4 w-4" /> : getUserInitials()}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{user?.email?.split('@')[0] || 'User'}</p>
                <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </aside>
  );
}
