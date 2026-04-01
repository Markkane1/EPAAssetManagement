import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployees } from "@/hooks/useEmployees";
import { useAssignmentsByEmployee } from "@/hooks/useAssignments";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useConsumableBalances, useConsumeConsumables } from "@/hooks/useConsumableInventory";
import { useConsumableItems } from "@/hooks/useConsumableItems";
import { useConsumableLots } from "@/hooks/useConsumableLots";

function asId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as { id?: unknown; _id?: unknown; $oid?: unknown };
    if (typeof record.id === "string") return record.id;
    if (typeof record._id === "string") return record._id;
    if (typeof record.$oid === "string") return record.$oid;
  }
  return "";
}

type ConsumableRow = {
  id: string;
  itemId: string;
  lotId: string | null;
  itemName: string;
  lot: string;
  onHand: number;
  reserved: number;
  uom: string;
};

export default function MyAssets() {
  const { user } = useAuth();
  const { data: employees } = useEmployees();
  const { data: assetItems } = useAssetItems();
  const { data: assets } = useAssets();
  const { data: consumableItems } = useConsumableItems();
  const { data: lots } = useConsumableLots();
  const consumeMutation = useConsumeConsumables();
  const [consumeTarget, setConsumeTarget] = useState<ConsumableRow | null>(null);
  const [consumeQty, setConsumeQty] = useState("1");
  const [consumeNotes, setConsumeNotes] = useState("");
  const [consumeError, setConsumeError] = useState("");

  const employeeList = useMemo(() => employees || [], [employees]);
  const assetItemList = useMemo(() => assetItems || [], [assetItems]);
  const assetList = useMemo(() => assets || [], [assets]);

  const currentEmployee = useMemo(() => {
    const userId = asId(user?.id);
    const userEmail = String(user?.email || "").toLowerCase();
    return (
      employeeList.find((entry) => asId(entry.user_id) === userId) ||
      employeeList.find((entry) => String(entry.email || "").toLowerCase() === userEmail) ||
      null
    );
  }, [employeeList, user?.email, user?.id]);
  const currentEmployeeId = asId(currentEmployee);

  const { data: employeeAssignments } = useAssignmentsByEmployee(currentEmployeeId || "");

  const { data: consumableBalances } = useConsumableBalances(
    currentEmployeeId
      ? {
          holderType: "EMPLOYEE",
          holderId: currentEmployeeId,
        }
      : undefined
  );

  const movableRows = useMemo(() => {
    if (!currentEmployeeId) return [];
    const assignmentList = employeeAssignments || [];
    return assignmentList
      .filter(
        (assignment) =>
          assignment.is_active &&
          !assignment.returned_date &&
          asId(assignment.employee_id) === currentEmployeeId
      )
      .map((assignment) => {
        const assetItem = assetItemList.find((item) => asId(item.id) === asId(assignment.asset_item_id));
        const asset = assetList.find((item) => asId(item.id) === asId(assetItem?.asset_id));
        return {
          id: asId(assignment.id) || `${asId(assignment.asset_item_id)}-${assignment.assigned_date}`,
          itemName: asset?.name || "Unknown Asset",
          tag: assetItem?.tag || "N/A",
          serialNumber: assetItem?.serial_number || "N/A",
          assignedOn: assignment.assigned_date || "",
          status: assignment.status || (assignment.is_active ? "Active" : "Closed"),
        };
      });
  }, [assetItemList, assetList, currentEmployeeId, employeeAssignments]);

  const consumableRows = useMemo<ConsumableRow[]>(() => {
    if (!currentEmployeeId) return [];
    const balances = consumableBalances || [];
    return balances
      .filter(
        (balance) =>
          String(balance.holder_type || "").toUpperCase() === "EMPLOYEE" &&
          asId(balance.holder_id) === currentEmployeeId &&
          Number(balance.qty_on_hand_base || 0) > 0
      )
      .map((balance) => {
        const item = (consumableItems || []).find(
          (entry) => asId(entry.id) === asId(balance.consumable_item_id)
        );
        const lot = (lots || []).find((entry) => asId(entry.id) === asId(balance.lot_id));
        const lotId = asId(balance.lot_id);
        return {
          id: `${asId(balance.consumable_item_id)}-${asId(balance.lot_id) || "none"}`,
          itemId: asId(balance.consumable_item_id),
          lotId: lotId || null,
          itemName: item?.name || "Unknown Consumable",
          lot: lot?.batch_no || "N/A",
          onHand: Number(balance.qty_on_hand_base || 0),
          reserved: Number(balance.qty_reserved_base || 0),
          uom: item?.base_uom || "",
        };
      });
  }, [consumableBalances, consumableItems, currentEmployeeId, lots]);

  const moveableColumns = [
    { key: "itemName", label: "Item" },
    { key: "tag", label: "Tag" },
    { key: "serialNumber", label: "Serial" },
    {
      key: "assignedOn",
      label: "Assigned On",
      render: (value: unknown) => {
        const raw = String(value || "");
        if (!raw) return "N/A";
        return new Date(raw).toLocaleDateString();
      },
    },
    { key: "status", label: "Status" },
  ];

  const consumableColumns = [
    { key: "itemName", label: "Item" },
    { key: "lot", label: "Lot" },
    {
      key: "onHand",
      label: "On Hand",
      render: (value: unknown, row: { uom?: string }) =>
        `${Number(value || 0).toLocaleString()} ${row.uom || ""}`,
    },
    {
      key: "reserved",
      label: "Reserved",
      render: (value: unknown, row: { uom?: string }) =>
        `${Number(value || 0).toLocaleString()} ${row.uom || ""}`,
    },
  ];

  const openConsumeDialog = (row: ConsumableRow) => {
    setConsumeTarget(row);
    setConsumeQty("1");
    setConsumeNotes("");
    setConsumeError("");
  };

  const closeConsumeDialog = () => {
    if (consumeMutation.isPending) return;
    setConsumeTarget(null);
    setConsumeQty("1");
    setConsumeNotes("");
    setConsumeError("");
  };

  const submitConsume = async () => {
    if (!consumeTarget || !currentEmployeeId) return;
    const qty = Number(consumeQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setConsumeError("Quantity must be greater than zero");
      return;
    }
    if (qty > consumeTarget.onHand) {
      setConsumeError(`Available stock is ${consumeTarget.onHand} ${consumeTarget.uom || ""}`.trim());
      return;
    }
    setConsumeError("");
    await consumeMutation.mutateAsync({
      holderType: "EMPLOYEE",
      holderId: currentEmployeeId,
      itemId: consumeTarget.itemId,
      lotId: consumeTarget.lotId || undefined,
      qty,
      uom: consumeTarget.uom || "EA",
      notes: consumeNotes.trim() || "Consumed from My Assets",
    });
    closeConsumeDialog();
  };

  return (
    <MainLayout title="My Assets" description="Assets assigned to your profile">
      <PageHeader
        title="My Assets"
        description="Separate view of your assigned moveable and consumable assets"
      />

      {!currentEmployeeId && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Employee mapping missing</AlertTitle>
          <AlertDescription>
            Your login is not linked to an employee profile. Contact your administrator.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Moveable Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={moveableColumns}
              data={movableRows}
              searchPlaceholder="Search assigned moveable assets..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consumable Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={consumableColumns}
              data={consumableRows}
              searchPlaceholder="Search assigned consumables..."
              actions={(row) => (
                <Button
                  size="sm"
                  onClick={() => openConsumeDialog(row)}
                  disabled={consumeMutation.isPending}
                >
                  Mark Consumed
                </Button>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(consumeTarget)} onOpenChange={(open) => (open ? undefined : closeConsumeDialog())}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Mark Consumable as Consumed</DialogTitle>
            <DialogDescription>
              {consumeTarget
                ? `${consumeTarget.itemName}${consumeTarget.lot !== "N/A" ? ` | Lot ${consumeTarget.lot}` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="my-assets-consume-qty">Quantity</Label>
              <Input
                id="my-assets-consume-qty"
                type="number"
                min="0.01"
                step="0.01"
                value={consumeQty}
                onChange={(event) => {
                  setConsumeQty(event.target.value);
                  if (consumeError) setConsumeError("");
                }}
              />
              <p className="text-xs text-muted-foreground">
                Available: {Number(consumeTarget?.onHand || 0).toLocaleString()} {consumeTarget?.uom || ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="my-assets-consume-notes">Notes</Label>
              <Input
                id="my-assets-consume-notes"
                value={consumeNotes}
                onChange={(event) => {
                  setConsumeNotes(event.target.value);
                  if (consumeError) setConsumeError("");
                }}
                placeholder="Optional notes"
              />
            </div>
            {consumeError && <p className="text-sm text-destructive">{consumeError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeConsumeDialog} disabled={consumeMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void submitConsume()} disabled={consumeMutation.isPending}>
              {consumeMutation.isPending ? "Saving..." : "Confirm Consumption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
