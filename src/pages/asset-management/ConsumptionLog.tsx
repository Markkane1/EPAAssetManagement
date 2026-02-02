import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Loader2 } from "lucide-react";
import { consumableConsumptionService } from "@/services/consumableConsumptionService";
import { useConsumables } from "@/hooks/useConsumables";
import { useLocations } from "@/hooks/useLocations";
import { useAuth } from "@/contexts/AuthContext";

export default function ConsumptionLog() {
  const { role, locationId } = useAuth();
  const { data: consumables } = useConsumables();
  const { data: locations } = useLocations();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["consumable-consumptions", role === "location_admin" ? locationId : "all"],
    queryFn: () => consumableConsumptionService.getAll(role === "location_admin" ? locationId || undefined : undefined),
    enabled: role !== "location_admin" || !!locationId,
  });

  const consumableList = consumables || [];
  const locationList = locations || [];

  const rows = useMemo(
    () =>
      logs.map((log) => ({
        ...log,
        consumableName: consumableList.find((c) => c.id === log.consumable_id)?.name || "Unknown",
        locationName: locationList.find((l) => l.id === log.location_id)?.name || "Unknown",
      })),
    [logs, consumableList, locationList]
  );

  const columns = [
    { key: "consumableName", label: "Consumable" },
    { key: "locationName", label: "Location" },
    { key: "available_quantity", label: "Available Qty" },
    { key: "consumed_quantity", label: "Consumed Qty" },
    { key: "remaining_quantity", label: "Remaining Qty" },
    {
      key: "consumed_at",
      label: "Date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
  ];

  if (isLoading) {
    return (
      <MainLayout title="Consumption Log" description="Consumable consumption history">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Consumption Log" description="Consumable consumption history">
      <PageHeader
        title="Consumption Log"
        description="Track consumed quantities for each consumable"
      />
      <DataTable columns={columns} data={rows as any} searchPlaceholder="Search consumables..." />
    </MainLayout>
  );
}
