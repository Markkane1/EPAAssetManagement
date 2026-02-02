import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { useAssets } from "@/hooks/useAssets";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useEmployees } from "@/hooks/useEmployees";
import { useConsumables } from "@/hooks/useConsumables";
import { useConsumableAssignments, useTransferConsumableBatch } from "@/hooks/useConsumableAssignments";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { convertQuantity, getCompatibleUnits } from "@/lib/unitUtils";
import { toast } from "sonner";
import type { ConsumableAsset } from "@/types";

type ConsumableSelection = {
  quantity: string;
  unit: string;
};

export default function BatchTransfer() {
  const { role, locationId, user } = useAuth();
  const { data: locations } = useLocations();
  const { data: assets } = useAssets();
  const { data: assetItems, isLoading: isAssetItemsLoading } = useAssetItems();
  const { data: employees } = useEmployees();
  const { data: consumables, isLoading: isConsumablesLoading } = useConsumables();
  const { data: consumableAssignments } = useConsumableAssignments();
  const createTransfer = useCreateTransfer();
  const transferConsumables = useTransferConsumableBatch();

  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [performedBy, setPerformedBy] = useState(user?.email || "");
  const [reason, setReason] = useState("");
  const [receivedByEmployeeId, setReceivedByEmployeeId] = useState("");
  const [selectedAssetItemIds, setSelectedAssetItemIds] = useState<string[]>([]);
  const [consumableSelections, setConsumableSelections] = useState<Record<string, ConsumableSelection>>({});
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const locationList = locations || [];
  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const employeeList = employees || [];
  const consumableList = consumables || [];
  const assignmentList = consumableAssignments || [];

  useEffect(() => {
    if (role === "location_admin" && locationId) {
      setFromLocationId(locationId);
    }
  }, [role, locationId]);

  useEffect(() => {
    setSelectedAssetItemIds([]);
    setConsumableSelections({});
  }, [fromLocationId]);

  const assetById = useMemo(
    () => new Map(assetList.map((asset) => [asset.id, asset])),
    [assetList]
  );

  const filteredAssetItems = useMemo(() => {
    if (!fromLocationId) return [];
    return assetItemList.filter((item) => item.location_id === fromLocationId);
  }, [assetItemList, fromLocationId]);

  const destinationLocations = useMemo(
    () => locationList.filter((loc) => loc.id !== fromLocationId),
    [locationList, fromLocationId]
  );

  const receiverCandidates = useMemo(() => {
    if (!toLocationId) return [];
    return employeeList.filter((emp) => emp.is_active && emp.location_id === toLocationId);
  }, [employeeList, toLocationId]);

  const locationConsumableTotals = useMemo(() => {
    if (!fromLocationId) return new Map<string, number>();
    const totals = new Map<string, number>();
    const employeeIds = new Set(
      employeeList.filter((emp) => emp.location_id === fromLocationId).map((emp) => emp.id)
    );
    assignmentList
      .filter((assignment) => {
        if (assignment.assignee_type === "location") {
          return assignment.assignee_id === fromLocationId;
        }
        if (assignment.assignee_type === "employee") {
          return employeeIds.has(assignment.assignee_id);
        }
        return false;
      })
      .forEach((assignment) => {
        const next = (totals.get(assignment.consumable_id) || 0) + Number(assignment.quantity || 0);
        totals.set(assignment.consumable_id, next);
      });
    return totals;
  }, [assignmentList, fromLocationId, employeeList]);

  const consumablesAtLocation = useMemo(() => {
    if (!fromLocationId) return [] as Array<ConsumableAsset & { availableAtLocation: number }>;
    return consumableList
      .map((consumable) => ({
        ...consumable,
        availableAtLocation: locationConsumableTotals.get(consumable.id) || 0,
      }))
      .filter((item) => item.availableAtLocation > 0);
  }, [consumableList, fromLocationId, locationConsumableTotals]);

  const handleAssetToggle = (assetItemId: string, isChecked: boolean) => {
    setSelectedAssetItemIds((prev) =>
      isChecked ? [...prev, assetItemId] : prev.filter((id) => id !== assetItemId)
    );
  };

  const handleConsumableChange = (consumableId: string, field: keyof ConsumableSelection, value: string) => {
    setConsumableSelections((prev) => ({
      ...prev,
      [consumableId]: {
        quantity: prev[consumableId]?.quantity || "",
        unit: prev[consumableId]?.unit || "",
        [field]: value,
      },
    }));
  };

  const selectedConsumableItems = useMemo(() => {
    return Object.entries(consumableSelections)
      .filter(([, selection]) => Number(selection.quantity) > 0)
      .map(([consumableId, selection]) => ({
        consumableId,
        quantity: Number(selection.quantity),
        unit: selection.unit,
      }));
  }, [consumableSelections]);

  const handleSubmit = async () => {
    if (!fromLocationId || !toLocationId) {
      toast.error("Select both source and destination locations");
      return;
    }
    if (fromLocationId === toLocationId) {
      toast.error("Source and destination locations must be different");
      return;
    }

    const hasAssets = selectedAssetItemIds.length > 0;
    const hasConsumables = selectedConsumableItems.length > 0;

    if (!hasAssets && !hasConsumables) {
      toast.error("Select asset items or consumables to transfer");
      return;
    }

    if (!performedBy.trim()) {
      toast.error("Performed by is required");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    if (hasConsumables && !receivedByEmployeeId) {
      toast.error("Receiving employee is required for consumable transfers");
      return;
    }

    setIsSubmitting(true);
    try {
      if (hasAssets) {
        await Promise.all(
          selectedAssetItemIds.map((assetItemId) =>
            createTransfer.mutateAsync({
              assetItemId,
              fromLocationId,
              toLocationId,
              transferDate,
              reason,
              performedBy,
            })
          )
        );
      }

      if (hasConsumables) {
        const items = selectedConsumableItems.map((selection) => {
          const consumable = consumableList.find((c) => c.id === selection.consumableId);
          const baseUnit = consumable?.unit || selection.unit;
          const converted = convertQuantity(selection.quantity, selection.unit || baseUnit, baseUnit);
          if (converted === null) {
            throw new Error(`Unit is not compatible for ${consumable?.name || "consumable"}`);
          }
          const available = locationConsumableTotals.get(selection.consumableId) || 0;
          if (converted > available) {
            throw new Error(`Quantity exceeds available for ${consumable?.name || "consumable"}`);
          }
          return {
            consumableId: selection.consumableId,
            quantity: converted,
            inputQuantity: selection.quantity,
            inputUnit: selection.unit || baseUnit,
          };
        });

        await transferConsumables.mutateAsync({
          fromLocationId,
          toLocationId,
          assignedDate: transferDate,
          notes: reason,
          receivedByEmployeeId,
          items,
        });
      }

      setSelectedAssetItemIds([]);
      setConsumableSelections({});
      setReason("");
      toast.success("Batch transfer completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch transfer failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isAssetItemsLoading || isConsumablesLoading;

  return (
    <MainLayout title="Batch Transfer" description="Transfer asset items and consumables in one batch">
      <PageHeader
        title="Batch Transfer"
        description="Move multiple asset items and consumables between locations"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transfer Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Transfer From *</Label>
                <Select
                  value={fromLocationId}
                  onValueChange={(value) => setFromLocationId(value)}
                  disabled={role === "location_admin"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locationList.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transfer To *</Label>
                <Select value={toLocationId} onValueChange={(value) => setToLocationId(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination location" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationLocations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Transfer Date *</Label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Performed By *</Label>
                <Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Name" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Received By (Employee for Consumables) *</Label>
              <Select value={receivedByEmployeeId} onValueChange={(value) => setReceivedByEmployeeId(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {receiverCandidates.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.first_name} {employee.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Asset Items</span>
              <span className="font-medium">{selectedAssetItemIds.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Consumables</span>
              <span className="font-medium">{selectedConsumableItems.length}</span>
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || isLoading}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Batch Transfer
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Asset Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Popover open={assetPickerOpen} onOpenChange={setAssetPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between" disabled={!fromLocationId}>
                  {fromLocationId
                    ? selectedAssetItemIds.length > 0
                      ? `${selectedAssetItemIds.length} item${selectedAssetItemIds.length > 1 ? "s" : ""} selected`
                      : "Select asset items..."
                    : "Select source location first"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type tag or asset name..." />
                  <CommandList>
                    <CommandEmpty>No assets found.</CommandEmpty>
                    {filteredAssetItems.map((item) => {
                      const assetName = assetById.get(item.asset_id)?.name || "Unknown";
                      const isChecked = selectedAssetItemIds.includes(item.id);
                      return (
                        <CommandItem
                          key={item.id}
                          value={`${item.tag || ""} ${assetName}`}
                          onSelect={() => handleAssetToggle(item.id, !isChecked)}
                        >
                          <span className="font-mono">{item.tag}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{assetName}</span>
                          {isChecked && <span className="ml-auto text-xs text-primary">Selected</span>}
                        </CommandItem>
                      );
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedAssetItemIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedAssetItemIds.map((itemId) => {
                  const item = filteredAssetItems.find((entry) => entry.id === itemId);
                  if (!item) return null;
                  const assetName = assetById.get(item.asset_id)?.name || "Unknown";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                      onClick={() => handleAssetToggle(item.id, false)}
                    >
                      {item.tag} - {assetName}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consumables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!fromLocationId ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        Select a source location to see consumables.
                      </TableCell>
                    </TableRow>
                  ) : consumablesAtLocation.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        No consumables available at this location.
                      </TableCell>
                    </TableRow>
                  ) : (
                    consumablesAtLocation.map((consumable) => {
                      const selection = consumableSelections[consumable.id] || {
                        quantity: "",
                        unit: consumable.unit,
                      };
                      const units = getCompatibleUnits(consumable.unit).filter((unit) => unit);
                      return (
                        <TableRow key={consumable.id}>
                          <TableCell>
                            <div className="font-medium">{consumable.name}</div>
                            <div className="text-xs text-muted-foreground">{consumable.category_id || "Uncategorized"}</div>
                          </TableCell>
                          <TableCell>
                            {consumable.availableAtLocation} {consumable.unit}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={Number(selection.quantity) > 0}
                                onCheckedChange={(checked) =>
                                  handleConsumableChange(consumable.id, "quantity", checked ? "1" : "")
                                }
                              />
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={selection.quantity}
                                onChange={(e) => handleConsumableChange(consumable.id, "quantity", e.target.value)}
                                className="w-24"
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={selection.unit || consumable.unit}
                              onValueChange={(value) => handleConsumableChange(consumable.id, "unit", value)}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {units.map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
