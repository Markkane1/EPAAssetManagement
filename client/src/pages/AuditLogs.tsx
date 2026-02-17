import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { 
  Download, 
  Search, 
  Shield, 
  CheckCircle, 
  XCircle,
  User,
  LogIn,
  LogOut,
  Eye,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  FileDown
} from "lucide-react";
import { format } from "date-fns";
import { 
  getAuditLogs,
  type AuditAction,
} from "@/lib/auditLog";
import { exportToCSV, exportToJSON } from "@/lib/exportUtils";
import { usePageSearch } from "@/contexts/PageSearchContext";

const actionIcons: Record<AuditAction, React.ReactNode> = {
  LOGIN_SUCCESS: <LogIn className="h-4 w-4 text-primary" />,
  LOGIN_FAILED: <LogIn className="h-4 w-4 text-destructive" />,
  LOGOUT: <LogOut className="h-4 w-4 text-muted-foreground" />,
  PAGE_VIEW: <Eye className="h-4 w-4 text-info" />,
  CREATE: <Plus className="h-4 w-4 text-success" />,
  UPDATE: <Pencil className="h-4 w-4 text-warning" />,
  DELETE: <Trash2 className="h-4 w-4 text-destructive" />,
  EXPORT: <FileDown className="h-4 w-4 text-info" />,
  TRANSFER: <ArrowRightLeft className="h-4 w-4 text-primary" />,
  ASSIGN: <User className="h-4 w-4 text-primary" />,
};

const actionLabels: Record<AuditAction, string> = {
  LOGIN_SUCCESS: 'Login Success',
  LOGIN_FAILED: 'Login Failed',
  LOGOUT: 'Logout',
  PAGE_VIEW: 'Page View',
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  EXPORT: 'Export',
  TRANSFER: 'Transfer',
  ASSIGN: 'Assign',
};

export default function AuditLogs() {
  const pageSearch = usePageSearch();
  const searchQuery = pageSearch?.term || "";
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const allLogs = getAuditLogs();

  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      const matchesSearch = 
        searchQuery === "" ||
        log.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.resource?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesCategory = categoryFilter === "all" || log.category === categoryFilter;
      const matchesStatus = statusFilter === "all" || log.status === statusFilter;

      return matchesSearch && matchesAction && matchesCategory && matchesStatus;
    });
  }, [allLogs, searchQuery, actionFilter, categoryFilter, statusFilter]);

  const handleExportCSV = () => {
    exportToCSV(
      filteredLogs.map((log) => ({
        ...log,
        actionLabel: actionLabels[log.action],
      })),
      [
        { key: "timestamp", header: "Timestamp" },
        { key: "userEmail", header: "User" },
        { key: "actionLabel", header: "Action" },
        { key: "category", header: "Category" },
        { key: "details", header: "Details" },
        { key: "status", header: "Status" },
      ],
      `audit-logs-${format(new Date(), "yyyy-MM-dd")}`,
    );
  };

  const handleExportJSON = () => {
    exportToJSON(
      filteredLogs.map((log) => ({
        timestamp: log.timestamp,
        user: log.userEmail,
        action: actionLabels[log.action],
        category: log.category,
        details: log.details,
        status: log.status,
      })),
      `audit-logs-${format(new Date(), "yyyy-MM-dd")}`,
    );
  };

  // Get unique categories from logs
  const uniqueCategories = useMemo(() => {
    const categories = new Set(allLogs.map(log => log.category));
    return Array.from(categories);
  }, [allLogs]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogs = allLogs.filter(log => new Date(log.timestamp) >= today);
    const failedLogins = allLogs.filter(log => log.action === 'LOGIN_FAILED').length;
    const successfulLogins = allLogs.filter(log => log.action === 'LOGIN_SUCCESS').length;

    return {
      total: allLogs.length,
      today: todayLogs.length,
      failedLogins,
      successfulLogins,
    };
  }, [allLogs]);

  return (
    <MainLayout title="Audit Logs" description="Security and activity logs">
      <PageHeader
        title="Audit Logs"
        description="Track all user actions and security events"
        extra={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJSON}>
              <Download className="h-4 w-4 mr-2" />
              JSON
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info/10 rounded-lg">
                <Eye className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.today}</p>
                <p className="text-sm text-muted-foreground">Today's Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.successfulLogins}</p>
                <p className="text-sm text-muted-foreground">Successful Logins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.failedLogins}</p>
                <p className="text-sm text-muted-foreground">Failed Logins</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => pageSearch?.setTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {Object.entries(actionLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Log ({filteredLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.slice(0, 100).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{log.userEmail || 'Anonymous'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {actionIcons[log.action]}
                          <span className="text-sm">{actionLabels[log.action]}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                        {log.details || '-'}
                      </TableCell>
                      <TableCell>
                        {log.status === 'success' ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                            Success
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredLogs.length > 100 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Showing first 100 of {filteredLogs.length} logs. Export to see all.
            </p>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
