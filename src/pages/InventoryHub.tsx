import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssets } from "@/hooks/useAssets";
import { useAssetItems } from "@/hooks/useAssetItems";
import { useAssignments } from "@/hooks/useAssignments";
import { useConsumables } from "@/hooks/useConsumables";
import { useConsumableAssignments } from "@/hooks/useConsumableAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useLocations } from "@/hooks/useLocations";
import { exportToCSV, filterRowsBySearch, formatDateForExport } from "@/lib/exportUtils";
import { usePageSearch } from "@/contexts/PageSearchContext";

type UnifiedRow = {
  id: string;
  itemType: "Capital" | "Consumable";
  itemName: string;
  identifier: string;
  status: string;
  assignedTo: string;
  assignmentType: string;
  location: string;
  assignedOn: string;
  quantity: string;
};

export default function InventoryHub() {
  const pageSearch = usePageSearch();
  const [typeFilter, setTypeFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");

  const { data: assets } = useAssets();
  const { data: assetItems } = useAssetItems();
  const { data: assignments } = useAssignments();
  const { data: consumables } = useConsumables();
  const { data: consumableAssignments } = useConsumableAssignments();
  const { data: employees } = useEmployees();
  const { data: locations } = useLocations();

  const assetRows = useMemo(() => {
    const assetList = assets || [];
    const itemList = assetItems || [];
    const assignmentList = assignments || [];
    const employeeList = employees || [];
    const locationList = locations || [];

    const assignmentMap = assignmentList.reduce((map, assignment) => {
      if (!assignment.is_active) return map;
      const existing = map.get(assignment.asset_item_id);
      if (!existing) {
        map.set(assignment.asset_item_id, assignment);
        return map;
      }
      const existingDate = new Date(existing.assigned_date).getTime();
      const currentDate = new Date(assignment.assigned_date).getTime();
      if (currentDate > existingDate) {
        map.set(assignment.asset_item_id, assignment);
      }
      return map;
    }, new Map<string, (typeof assignmentList)[number]>());

    return itemList.map<UnifiedRow>((item) => {
      const asset = assetList.find((assetEntry) => assetEntry.id === item.asset_id);
      const activeAssignment = assignmentMap.get(item.id);
      const assignedEmployee = activeAssignment
        ? employeeList.find((employee) => employee.id === activeAssignment.employee_id)
        : undefined;
      const location = locationList.find((loc) => loc.id === item.location_id);

      return {
        id: `asset-${item.id}`,
        itemType: "Capital",
        itemName: asset?.name || "Unknown",
        identifier: item.tag || item.serial_number || "N/A",
        status: activeAssignment ? "Assigned" : "Unassigned",
        assignedTo: assignedEmployee
          ? `${assignedEmployee.first_name} ${assignedEmployee.last_name}`
          : "Unassigned",
        assignmentType: activeAssignment ? "Employee" : "-",
        location: location?.name || "Unassigned",
        assignedOn: activeAssignment?.assigned_date || "",
        quantity: "1",
      };
    });
  }, [assets, assetItems, assignments, employees, locations]);

  const consumableRows = useMemo(() => {
    const consumableList = consumables || [];
    const assignmentList = consumableAssignments || [];
    const employeeList = employees || [];
    const locationList = locations || [];

    return assignmentList.map<UnifiedRow>((assignment) => {
      const consumable = consumableList.find((item) => item.id === assignment.consumable_id);
      const assignee =
        assignment.assignee_type === "employee"
          ? employeeList.find((employee) => employee.id === assignment.assignee_id)
          : undefined;
      const location = assignment.assignee_type === "location"
        ? locationList.find((loc) => loc.id === assignment.assignee_id)
        : undefined;
      const receivedBy =
        assignment.received_by_employee_id
          ? employeeList.find((employee) => employee.id === assignment.received_by_employee_id)
          : undefined;

      const assignedTo = assignment.assignee_type === "employee"
        ? assignee
          ? `${assignee.first_name} ${assignee.last_name}`
          : "Unknown"
        : location?.name || "Unknown";

      const assignmentType = assignment.assignee_type === "employee" ? "Employee" : "Location";
      const receivedByLabel =
        assignment.assignee_type === "location" && receivedBy
          ? ` (Received by ${receivedBy.first_name} ${receivedBy.last_name})`
          : "";

      const quantityValue = assignment.input_quantity ?? assignment.quantity;
      const unitValue = assignment.input_unit || consumable?.unit || "";

      return {
        id: `consumable-${assignment.id}`,
        itemType: "Consumable",
        itemName: consumable?.name || "Unknown",
        identifier: consumable?.unit || "Unit",
        status: "Assigned",
        assignedTo: `${assignedTo}${receivedByLabel}`,
        assignmentType,
        location: assignment.assignee_type === "location" ? (location?.name || "Unknown") : "-",
        assignedOn: assignment.assigned_date,
        quantity: `${quantityValue} ${unitValue}`.trim(),
      };
    });
  }, [consumables, consumableAssignments, employees, locations]);

  const baseRows = useMemo(() => {
    const combined = [...assetRows, ...consumableRows];
    return combined.filter((row) => {
      if (typeFilter === "capital" && row.itemType !== "Capital") return false;
      if (typeFilter === "consumable" && row.itemType !== "Consumable") return false;
      if (assignmentFilter === "assigned" && row.status !== "Assigned") return false;
      if (assignmentFilter === "unassigned" && row.status !== "Unassigned") return false;
      return true;
    });
  }, [assetRows, consumableRows, typeFilter, assignmentFilter]);

  const searchTerm = pageSearch?.term || "";
  const exportRows = useMemo(
    () => filterRowsBySearch(baseRows as any, searchTerm),
    [baseRows, searchTerm]
  );

  const columns = [
    { key: "itemType", label: "Type" },
    { key: "itemName", label: "Item" },
    { key: "identifier", label: "Identifier" },
    { key: "status", label: "Status" },
    { key: "assignedTo", label: "Assigned To" },
    { key: "assignmentType", label: "Assign Type" },
    { key: "location", label: "Location" },
    {
      key: "assignedOn",
      label: "Assigned On",
      render: (value: string) => formatDateForExport(value),
    },
    { key: "quantity", label: "Qty" },
  ];

  const handleExportCSV = () => {
    exportToCSV(
      exportRows as any,
      [
        { key: "itemType", header: "Type" },
        { key: "itemName", header: "Item" },
        { key: "identifier", header: "Identifier" },
        { key: "status", header: "Status" },
        { key: "assignedTo", header: "Assigned To" },
        { key: "assignmentType", header: "Assign Type" },
        { key: "location", header: "Location" },
        { key: "assignedOn", header: "Assigned On", formatter: (v) => formatDateForExport(v as string) },
        { key: "quantity", header: "Qty" },
      ],
      "inventory-assignments"
    );
  };

  return (
    <MainLayout title="Inventory & Assignments" description="Unified view of assets, consumables, and assignments">
      <PageHeader
        title="Inventory & Assignments"
        description="One view for asset items and consumable assignments"
        extra={<ExportButton onExportCSV={handleExportCSV} />}
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filter:</span>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="capital">Capital Assets</SelectItem>
                <SelectItem value="consumable">Consumables</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignments</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={baseRows as any} searchable />
    </MainLayout>
  );
}
