import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAssignments } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { returnRequestService } from "@/services/returnRequestService";

type MongoIdLike = {
  id?: unknown;
  _id?: unknown;
  $oid?: unknown;
};

function asId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as MongoIdLike;
    if (typeof record.$oid === "string") return record.$oid;
    if (typeof record.id === "string") return record.id;
    if (typeof record._id === "string") return record._id;
  }
  return "";
}

function employeeId(employee: unknown): string {
  if (!employee || typeof employee !== "object") return "";
  const record = employee as MongoIdLike;
  return asId(record.id) || asId(record._id);
}

export default function ReturnRequestNew() {
  const navigate = useNavigate();
  const { user, locationId } = useAuth();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();
  const { data: employees, refetch: refetchEmployees } = useEmployees();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();

  const [selectedAssetItemIds, setSelectedAssetItemIds] = useState<string[]>([]);
  const [returnAll, setReturnAll] = useState(false);

  const employeeList = useMemo(() => employees || [], [employees]);
  const assignmentList = useMemo(() => assignments || [], [assignments]);
  const assetItemList = useMemo(() => assetItems || [], [assetItems]);
  const assetList = useMemo(() => assets || [], [assets]);

  const scopedEmployees = useMemo(() => {
    const officeId = asId(locationId);
    if (!officeId) return employeeList;
    const filtered = employeeList.filter((employee) => {
      const locationMatch = asId(employee.location_id) === officeId;
      const directorateMatch = asId(employee.directorate_id) === officeId;
      return locationMatch || directorateMatch;
    });
    return filtered.length > 0 ? filtered : employeeList;
  }, [employeeList, locationId]);

  const currentEmployee = useMemo(() => {
    const currentUserId = asId(user?.id);
    const byUserId = scopedEmployees.find((employee) => asId(employee.user_id) === currentUserId);
    const byEmail = scopedEmployees.find(
      (employee) => employee.email?.toLowerCase() === (user?.email || "").toLowerCase()
    );
    return byUserId || byEmail || null;
  }, [scopedEmployees, user?.id, user?.email]);
  const currentEmployeeId = useMemo(() => employeeId(currentEmployee), [currentEmployee]);

  useEffect(() => {
    void refetchEmployees();
  }, [refetchEmployees]);

  const myAssignments = useMemo(() => {
    if (!currentEmployeeId) return [];
    return assignmentList.filter(
      (assignment) =>
        asId(assignment.employee_id) === currentEmployeeId &&
        assignment.is_active &&
        !assignment.returned_date
    );
  }, [assignmentList, currentEmployeeId]);

  const myAssignedAssets = useMemo(() => {
    return myAssignments
      .map((assignment) => {
        const item = assetItemList.find((entry) => asId(entry.id) === asId(assignment.asset_item_id));
        if (!item) return null;
        const asset = assetList.find((entry) => asId(entry.id) === asId(item.asset_id));
        return {
          assignmentId: asId(assignment.id),
          assetItemId: asId(item.id),
          tag: item.tag || "N/A",
          serialNumber: item.serial_number || "N/A",
          assetName: asset?.name || "Unknown Asset",
          assignedDate: assignment.assigned_date,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [myAssignments, assetItemList, assetList]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentEmployeeId) {
        throw new Error("Your account is not mapped to an employee record.");
      }
      if (!returnAll && selectedAssetItemIds.length === 0) {
        throw new Error("Select at least one assigned asset, or use Return All.");
      }
      return returnRequestService.create({
        employeeId: currentEmployeeId,
        officeId: asId(locationId) || asId(currentEmployee?.location_id) || undefined,
        returnAll,
        assetItemIds: returnAll ? undefined : selectedAssetItemIds,
      });
    },
    onSuccess: (created) => {
      toast.success("Return request submitted.");
      const id = created.id || created._id;
      if (!id) return;
      navigate(`/returns/${id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit return request.");
    },
  });

  const toggleAsset = (assetItemId: string, checked: boolean) => {
    setSelectedAssetItemIds((previous) => {
      if (checked) {
        if (previous.includes(assetItemId)) return previous;
        return [...previous, assetItemId];
      }
      return previous.filter((id) => id !== assetItemId);
    });
  };

  if (assignmentsLoading) {
    return (
      <MainLayout title="New Return Request" description="Submit return request for assigned assets">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="New Return Request" description="Submit return request for assigned assets">
      <PageHeader
        title="Return Request"
        description="Select assigned assets to return, or return all."
      />

      <div className="mt-6 space-y-6">
        {!currentEmployee && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Employee mapping missing</AlertTitle>
            <AlertDescription>
              Your user account is not linked to an employee record. Contact your administrator.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>My Assigned Assets</CardTitle>
            <CardDescription>
              Select specific assets to return, or choose Return All.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 rounded border p-3">
              <Checkbox
                checked={returnAll}
                onCheckedChange={(checked) => {
                  const enabled = Boolean(checked);
                  setReturnAll(enabled);
                  if (enabled) {
                    setSelectedAssetItemIds([]);
                  }
                }}
              />
              <span className="text-sm font-medium">Return all assigned assets</span>
            </label>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="w-[50px] px-3 py-2 text-left">Select</th>
                    <th className="px-3 py-2 text-left">Asset</th>
                    <th className="px-3 py-2 text-left">Tag</th>
                    <th className="px-3 py-2 text-left">Serial</th>
                    <th className="px-3 py-2 text-left">Assigned Date</th>
                  </tr>
                </thead>
                <tbody>
                  {myAssignedAssets.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        No active assignments found.
                      </td>
                    </tr>
                  ) : (
                    myAssignedAssets.map((row) => (
                      <tr key={row.assetItemId} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <Checkbox
                            disabled={returnAll}
                            checked={selectedAssetItemIds.includes(row.assetItemId)}
                            onCheckedChange={(checked) =>
                              toggleAsset(row.assetItemId, Boolean(checked))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">{row.assetName}</td>
                        <td className="px-3 py-2 font-mono">{row.tag}</td>
                        <td className="px-3 py-2">{row.serialNumber}</td>
                        <td className="px-3 py-2">
                          {new Date(row.assignedDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/assignments")}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !currentEmployee}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Return Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
