import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Pencil, Mail, Phone, MapPin, Building2, Package, Loader2, ArrowRightLeft } from "lucide-react";
import { useEmployees, useTransferEmployee } from "@/hooks/useEmployees";
import { useDirectorates } from "@/hooks/useDirectorates";
import { useLocations } from "@/hooks/useLocations";
import { useAssignments } from "@/hooks/useAssignments";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { isHeadOfficeLocation } from "@/lib/locationUtils";
import { useAuth } from "@/contexts/AuthContext";
import { EmployeeTransferModal } from "@/components/forms/EmployeeTransferModal";

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, isSuperAdmin, locationId } = useAuth();

  const { data: employees, isLoading } = useEmployees();
  const { data: directorates } = useDirectorates();
  const { data: locations } = useLocations();
  const { data: assignments } = useAssignments();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const transferEmployee = useTransferEmployee();
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  const employeeList = employees || [];
  const directorateList = directorates || [];
  const locationList = locations || [];
  const assignmentList = assignments || [];
  const assetItemList = assetItems || [];
  const assetList = assets || [];

  const employee = employeeList.find((e) => e.id === id);
  const location = employee ? locationList.find((l) => l.id === employee.location_id) : null;
  const currentLocation = locationId ? locationList.find((l) => l.id === locationId) : null;
  const isHeadofficeIssuer =
    isHeadOfficeLocation(currentLocation) &&
    (role === "office_head" || role === "caretaker");
  const canTransferEmployee = isSuperAdmin || role === "org_admin" || isHeadofficeIssuer;
  const directorate = employee && isHeadOfficeLocation(location)
    ? directorateList.find((d) => d.id === employee.directorate_id)
    : null;
  const transferredFromOfficeName = employee?.transferred_from_office_id
    ? locationList.find((l) => l.id === employee.transferred_from_office_id)?.name ||
      employee.transferred_from_office_id
    : null;
  const transferredToOfficeName = employee?.transferred_to_office_id
    ? locationList.find((l) => l.id === employee.transferred_to_office_id)?.name ||
      employee.transferred_to_office_id
    : null;
  
  // Get active assignments for this employee
  const employeeAssignments = assignmentList.filter((a) => a.employee_id === id && a.is_active);
  const assignedItems = employeeAssignments.map((assignment) => {
    const item = assetItemList.find((i) => i.id === assignment.asset_item_id);
    const asset = item ? assetList.find((a) => a.id === item.asset_id) : null;
    return { assignment, item, asset };
  }).filter((x) => x.item);

  const handleTransferSubmit = async (payload: { newOfficeId: string; reason?: string }) => {
    if (!employee) return;
    await transferEmployee.mutateAsync({
      id: employee.id,
      data: payload,
    });
    setIsTransferModalOpen(false);
  };

  if (isLoading) {
    return (
      <MainLayout title="Employee Details" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!employee) {
    return (
      <MainLayout title="Employee Not Found" description="">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">The requested employee could not be found.</p>
          <Button onClick={() => navigate("/employees")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Employees
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={`${employee.first_name} ${employee.last_name}`} description="Employee profile">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/employees")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                {employee.first_name[0]}{employee.last_name[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{employee.first_name} {employee.last_name}</h1>
                <Badge variant={employee.is_active ? "default" : "secondary"} className={employee.is_active ? "bg-success text-success-foreground" : ""}>
                  {employee.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-muted-foreground">{employee.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.href = `mailto:${employee.email}`}>
              <Mail className="mr-2 h-4 w-4" /> Send Email
            </Button>
            {canTransferEmployee && (
              <Button
                variant="outline"
                onClick={() => setIsTransferModalOpen(true)}
                disabled={transferEmployee.isPending}
              >
                {transferEmployee.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                )}
                Transfer
              </Button>
            )}
            <Button onClick={() => navigate(`/employees?edit=${employee.id}`)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a href={`mailto:${employee.email}`} className="text-primary hover:underline">
                    {employee.email}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <span>{employee.phone}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <span>{location?.name || "N/A"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Directorate</p>
                  <span>{directorate?.name || "N/A"}</span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Transfer Metadata</p>
                {employee.transferred_at ? (
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Transferred At:</span>{" "}
                      {new Date(employee.transferred_at).toLocaleString()}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">From:</span>{" "}
                      {transferredFromOfficeName || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">To:</span>{" "}
                      {transferredToOfficeName || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Reason:</span>{" "}
                      {employee.transfer_reason || "N/A"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No transfer recorded.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Asset Summary */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assigned Assets</CardTitle>
                  <CardDescription>{assignedItems.length} items currently assigned</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-2xl font-bold text-primary">
                  <Package className="h-6 w-6" />
                  {assignedItems.length}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {assignedItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No assets currently assigned to this employee.</p>
              ) : (
                <div className="space-y-3">
                  {assignedItems.map(({ assignment, item, asset }) => (
                    <div key={assignment.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{asset?.name || "Unknown Asset"}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="font-mono">{item?.tag}</span>
                            <span>-</span>
                            <span>{item?.serial_number}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Assigned</p>
                        <p className="text-sm">{new Date(assignment.assigned_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Assignment History */}
        <Card>
          <CardHeader>
            <CardTitle>Assignment History</CardTitle>
            <CardDescription>All asset assignments for this employee</CardDescription>
          </CardHeader>
          <CardContent>
            {assignmentList.filter((a) => a.employee_id === id).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No assignment history found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Asset</th>
                      <th className="text-left py-3 px-4 font-medium">Tag</th>
                      <th className="text-left py-3 px-4 font-medium">Assigned Date</th>
                      <th className="text-left py-3 px-4 font-medium">Return Date</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentList
                      .filter((a) => a.employee_id === id)
                      .map((assignment) => {
                        const item = assetItemList.find((i) => i.id === assignment.asset_item_id);
                        const asset = item ? assetList.find((a) => a.id === item.asset_id) : null;
                        return (
                          <tr key={assignment.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-4 font-medium">{asset?.name || "Unknown"}</td>
                            <td className="py-3 px-4 font-mono text-primary">{item?.tag || "-"}</td>
                            <td className="py-3 px-4">{new Date(assignment.assigned_date).toLocaleDateString()}</td>
                            <td className="py-3 px-4">
                              {assignment.returned_date 
                                ? new Date(assignment.returned_date).toLocaleDateString() 
                                : "-"}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={assignment.is_active ? "default" : "secondary"} className={assignment.is_active ? "bg-success text-success-foreground" : ""}>
                                {assignment.is_active ? "Active" : "Returned"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground max-w-[200px] truncate">
                              {assignment.notes || "-"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <EmployeeTransferModal
        open={isTransferModalOpen}
        onOpenChange={setIsTransferModalOpen}
        employee={employee}
        offices={locationList}
        onSubmit={handleTransferSubmit}
      />
    </MainLayout>
  );
}
