import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MoreHorizontal, Eye, Pencil, Building2, Mail, Loader2, ArrowRightLeft, Users, Package } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Employee } from "@/types";
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useTransferEmployee,
} from "@/hooks/useEmployees";
import { useDirectorates } from "@/hooks/useDirectorates";
import { useLocations } from "@/hooks/useLocations";
import { EmployeeFormModal } from "@/components/forms/EmployeeFormModal";
import { EmployeeTransferModal } from "@/components/forms/EmployeeTransferModal";
import { isHeadOfficeLocationName, isHeadOfficeLocation } from "@/lib/locationUtils";
import { useAuth } from "@/contexts/AuthContext";
import { isOfficeAdminRole } from "@/services/authService";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";

export default function Employees() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, isOrgAdmin, locationId } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [tableDisplay, setTableDisplay] = useState<{
    filteredCount: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const { data: employees, isLoading } = useEmployees();
  const { data: directorates } = useDirectorates();
  const { data: locations } = useLocations();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const transferEmployee = useTransferEmployee();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Employee | null>(null);

  const employeeList = employees || [];
  const directorateList = directorates || [];
  const locationList = locations || [];

  const currentLocation = locationId ? locationList.find((loc) => loc.id === locationId) : undefined;
  const isOrgAdminHeadOffice = isOrgAdmin && isHeadOfficeLocation(currentLocation);
  const isOfficeAdmin = isOfficeAdminRole(role) || (isOrgAdmin && !isOrgAdminHeadOffice);
  const canManageEmployees = isOrgAdminHeadOffice || isOfficeAdmin;
  const canTransferEmployees = isOrgAdmin;

  const allowedLocations = isOrgAdmin
    ? locationList
    : locationId
      ? locationList.filter((loc) => loc.id === locationId)
      : [];

  const enrichedEmployees = employeeList.map((emp) => {
    const locationName = locationList.find((l) => l.id === emp.location_id)?.name || "N/A";
    const isHeadOffice = isHeadOfficeLocationName(locationName);
    return {
      ...emp,
      directorateName: isHeadOffice
        ? directorateList.find((d) => d.id === emp.directorate_id)?.name || "N/A"
        : "N/A",
      locationName,
      fullName: `${emp.first_name} ${emp.last_name}`,
    };
  });
  const activeEmployeeCount = enrichedEmployees.filter((employee) => employee.is_active).length;
  const headOfficeEmployeeCount = enrichedEmployees.filter((employee) => isHeadOfficeLocationName(employee.locationName)).length;
  const directorateCoverage = new Set(enrichedEmployees.map((employee) => employee.directorate_id).filter(Boolean)).size;
  const totalEmployees = enrichedEmployees.length;
  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));
  const displayCount = tableDisplay?.filteredCount ?? totalEmployees;
  const displayTotalPages = tableDisplay?.totalPages ?? totalPages;
  const displayRangeStart = tableDisplay?.rangeStart ?? (displayCount === 0 ? 0 : (page - 1) * pageSize + 1);
  const displayRangeEnd = tableDisplay?.rangeEnd ?? Math.min(page * pageSize, displayCount);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const editEmployeeId = searchParams.get("edit");
    if (!editEmployeeId) return;
    const targetEmployee = employeeList.find((employee) => employee.id === editEmployeeId) || null;
    if (!targetEmployee) return;
    setEditingEmployee(targetEmployee);
    setIsModalOpen(true);
  }, [employeeList, searchParams]);

  useEffect(() => {
    const editEmployeeId = searchParams.get("edit");
    if (!editEmployeeId || isModalOpen) return;
    const employee = employeeList.find((entry) => entry.id === editEmployeeId);
    if (!employee) return;
    setEditingEmployee(employee);
    setIsModalOpen(true);
  }, [employeeList, isModalOpen, searchParams]);

  const columns = [
    { key: "fullName", label: "Employee", render: (value: string, row: any) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary/10 text-primary font-medium">{row.first_name[0]}{row.last_name[0]}</AvatarFallback>
        </Avatar>
        <div><p className="font-medium">{value}</p><p className="text-xs text-muted-foreground">{row.email}</p></div>
      </div>
    )},
    { key: "job_title", label: "Job Title" },
    { key: "directorateName", label: "Directorate" },
    { key: "locationName", label: "Location" },
    { key: "phone", label: "Phone", render: (value: string) => <span className="text-muted-foreground">{value}</span> },
    { key: "is_active", label: "Status", render: (value: boolean) => (
      <Badge variant={value ? "default" : "secondary"} className={value ? "bg-success text-success-foreground" : ""}>{value ? "Active" : "Inactive"}</Badge>
    )},
  ];

  const handleAddEmployee = () => {
    setEditingEmployee(null);
    setIsModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("edit");
    setSearchParams(nextParams, { replace: true });
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("edit", employee.id);
    setSearchParams(nextParams, { replace: true });
  };

  const handleSubmit = async (data: any) => {
    if (editingEmployee) {
      const { _userPassword, ...payload } = data;
      await updateEmployee.mutateAsync({ id: editingEmployee.id, data: payload });
    } else {
      await createEmployee.mutateAsync(data);
      setPage(1);
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("edit");
    setSearchParams(nextParams, { replace: true });
  };

  const handleToggleActive = async (employee: Employee) => {
    await updateEmployee.mutateAsync({
      id: employee.id,
      data: { isActive: !employee.is_active },
    });
  };

  const openTransferModal = (employee: Employee) => {
    setTransferTarget(employee);
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = async (payload: { newOfficeId: string; reason?: string }) => {
    if (!transferTarget) return;
    await transferEmployee.mutateAsync({
      id: transferTarget.id,
      data: payload,
    });
    setTransferTarget(null);
    setIsTransferModalOpen(false);
  };

  const actions = (row: Employee) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/employees/${row.id}`)}><Eye className="h-4 w-4 mr-2" /> View Profile</DropdownMenuItem>
          {canManageEmployees && (
            <DropdownMenuItem onClick={() => handleEdit(row)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
          )}
          {canTransferEmployees && (
            <DropdownMenuItem onClick={() => openTransferModal(row)}>
              <ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.location.href = `mailto:${row.email}`}><Mail className="h-4 w-4 mr-2" /> Send Email</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/employees/${row.id}`)}><Package className="h-4 w-4 mr-2" /> View Assigned Assets</DropdownMenuItem>
        {canManageEmployees && (
          <DropdownMenuItem
            className={row.is_active ? "text-destructive" : ""}
            onClick={() => handleToggleActive(row)}
          >
            {row.is_active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Employees" description="Manage your organization's personnel">
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Employees" description="Manage your organization's personnel">
      <CollectionWorkspace
        title="Employees"
        description="View and manage employees and their asset assignments"
        action={canManageEmployees ? { label: "Add Employee", onClick: handleAddEmployee } : undefined}
        eyebrow="People workspace"
        meta={
          <>
            <span>{totalEmployees} employees in scope</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{canManageEmployees ? "Workforce management enabled" : "Read-only roster access"}</span>
          </>
        }
        metrics={[
          { label: "Visible employees", value: totalEmployees, helper: "Rows in the current employee view", icon: Users, tone: "primary" },
          { label: "Active", value: activeEmployeeCount, helper: "Currently active personnel records", icon: Mail, tone: "success" },
          { label: "Head office", value: headOfficeEmployeeCount, helper: "Employees currently placed at head office", icon: Building2 },
          { label: "Directorates", value: directorateCoverage, helper: "Distinct directorate assignments in scope", icon: ArrowRightLeft, tone: "warning" },
        ]}
        panelTitle="Employee roster"
        panelDescription="Browse the workforce, open profiles, and use row actions for activation, editing, and transfer operations."
      >
        <DataTable
          columns={columns}
          data={enrichedEmployees}
          pagination={false}
          externalPage={page}
          pageSize={pageSize}
          searchPlaceholder="Search employees..."
          actions={actions}
          onRowClick={(row) => navigate(`/employees/${row.id}`)}
          pageSizeOptions={[10, 20, 50, 100]}
          onExternalPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          onDisplayStateChange={setTableDisplay}
        />
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Showing {displayRangeStart} to {displayRangeEnd} of {displayCount} employees
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm font-medium">
              Page {page} of {displayTotalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((current) => Math.min(displayTotalPages, current + 1))}
              disabled={page >= displayTotalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </CollectionWorkspace>
      <EmployeeFormModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setEditingEmployee(null);
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("edit");
            setSearchParams(nextParams, { replace: true });
          }
        }}
        employee={editingEmployee}
        directorates={directorateList}
        locations={allowedLocations}
        locationLocked={!isOrgAdmin}
        fixedLocationId={!isOrgAdmin ? locationId : null}
        onSubmit={handleSubmit}
      />
      <EmployeeTransferModal
        open={isTransferModalOpen}
        onOpenChange={(open) => {
          setIsTransferModalOpen(open);
          if (!open) setTransferTarget(null);
        }}
        employee={transferTarget}
        offices={locationList}
        onSubmit={handleTransferSubmit}
      />
    </MainLayout>
  );
}
