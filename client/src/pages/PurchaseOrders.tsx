import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PurchaseOrder } from "@/types";
import { usePurchaseOrders, useCreatePurchaseOrder, useUpdatePurchaseOrder, useDeletePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { useVendors } from "@/hooks/useVendors";
import { useProjects } from "@/hooks/useProjects";
import { PurchaseOrderFormModal } from "@/components/forms/PurchaseOrderFormModal";
import { exportToCSV, exportToJSON, filterRowsBySearch, formatDateForExport, formatCurrencyForExport, pickExportFields } from "@/lib/exportUtils";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function PurchaseOrders() {
  const { data: purchaseOrders, isLoading } = usePurchaseOrders();
  const { data: vendors } = useVendors();
  const { data: projects } = useProjects();
  const createPurchaseOrder = useCreatePurchaseOrder();
  const updatePurchaseOrder = useUpdatePurchaseOrder();
  const deletePurchaseOrder = useDeletePurchaseOrder();
  const pageSearch = usePageSearch();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);

  const orderList = purchaseOrders || [];
  const vendorList = vendors || [];
  const projectList = projects || [];

  const enrichedOrders = orderList.map((order) => ({
    ...order,
    vendorName: vendorList.find((v) => v.id === order.vendor_id)?.name || "N/A",
  }));

  const columns = [
    {
      key: "order_number",
      label: "Order #",
      render: (value: string) => (
        <span className="font-mono font-medium text-primary">{value}</span>
      ),
    },
    {
      key: "vendorName",
      label: "Vendor",
      render: (value: string) => (
        <span className="font-medium">{value}</span>
      ),
    },
    {
      key: "order_date",
      label: "Order Date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "total_amount",
      label: "Total Amount",
      render: (value: number) => (
        <span className="font-medium">PKR {value?.toLocaleString("en-PK") || 0}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (value: string) => <StatusBadge status={value || ""} />,
    },
    {
      key: "notes",
      label: "Notes",
      render: (value: string) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {value || "—"}
        </span>
      ),
    },
  ];

  const filteredOrders = useMemo(
    () => filterRowsBySearch(enrichedOrders as any, pageSearch?.term || ""),
    [enrichedOrders, pageSearch?.term],
  );

  const handleAddOrder = () => {
    setEditingOrder(null);
    setIsModalOpen(true);
  };

  const handleEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingOrder) {
      await updatePurchaseOrder.mutateAsync({ id: editingOrder.id, data });
    } else {
      await createPurchaseOrder.mutateAsync(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this purchase order?")) {
      deletePurchaseOrder.mutate(id);
    }
  };

  const actions = (row: PurchaseOrder) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Eye className="h-4 w-4 mr-2" /> View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="text-destructive"
          onClick={() => handleDelete(row.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Purchase Orders" description="Manage vendor orders">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  const handleExportCSV = () => {
    exportToCSV(filteredOrders as any, [
      { key: "order_number", header: "Order Number" },
      { key: "vendorName", header: "Vendor" },
      { key: "order_date", header: "Order Date", formatter: (v) => formatDateForExport(v as Date) },
      { key: "total_amount", header: "Total Amount", formatter: (v) => formatCurrencyForExport(v as number) },
      { key: "status", header: "Status" },
      { key: "notes", header: "Notes" },
    ], "purchase-orders");
  };

  const handleExportJSON = () => {
    exportToJSON(
      pickExportFields(filteredOrders as any, [
        "order_number",
        "vendorName",
        "order_date",
        "total_amount",
        "status",
        "notes",
      ]),
      "purchase-orders",
    );
  };

  return (
    <MainLayout title="Purchase Orders" description="Manage vendor orders">
      <PageHeader
        title="Purchase Orders"
        description="Create and track purchase orders from vendors"
        action={{
          label: "New Order",
          onClick: handleAddOrder,
        }}
        extra={<ExportButton onExportCSV={handleExportCSV} onExportJSON={handleExportJSON} />}
      />

      <DataTable
        columns={columns}
        data={enrichedOrders}
        searchPlaceholder="Search orders..."
        actions={actions as any}
      />

      <PurchaseOrderFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        purchaseOrder={editingOrder}
        vendors={vendorList}
        projects={projectList}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
