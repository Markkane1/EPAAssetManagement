import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MoreHorizontal, Eye, Pencil, Package, Mail, Loader2, ArrowRightLeft } from "lucide-react";
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

export default function Employees() {
  const navigate = useNavigate();
  const { role, isOrgAdmin, locationId } = useAuth();
  const { data: employees, isLoading, error } = useEmployees();
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
  const isOfficeAdmin = role === "office_head" || (isOrgAdmin && !isOrgAdminHeadOffice);
  const isHeadofficeIssuer =
    isHeadOfficeLocation(currentLocation) &&
    (role === "office_head" || role === "caretaker");
  const canManageEmployees = isOrgAdminHeadOffice || isOfficeAdmin;
  const canTransferEmployees = isOrgAdmin || isHeadofficeIssuer;

  const allowedLocations = isOrgAdminHeadOffice
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
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingEmployee) {
      const { userPassword, ...payload } = data;
      await updateEmployee.mutateAsync({ id: editingEmployee.id, data: payload });
    } else {
      await createEmployee.mutateAsync(data);
    }
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

  if (error) console.warn("API unavailable:", error);

  return (
    <MainLayout title="Employees" description="Manage your organization's personnel">
      <PageHeader
        title="Employees"
        description="View and manage employees and their asset assignments"
        action={canManageEmployees ? { label: "Add Employee", onClick: handleAddEmployee } : undefined}
      />
      <DataTable 
        columns={columns} 
        data={enrichedEmployees} 
        searchPlaceholder="Search employees..." 
        actions={actions} 
        onRowClick={(row) => navigate(`/employees/${row.id}`)}
      />
      <EmployeeFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        employee={editingEmployee}
        directorates={directorateList}
        locations={allowedLocations}
        locationLocked={!isOrgAdminHeadOffice}
        fixedLocationId={!isOrgAdminHeadOffice ? locationId : null}
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
