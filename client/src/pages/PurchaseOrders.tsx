import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { DataTable } from "@/components/shared/DataTable";
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
import { useSchemes } from "@/hooks/useSchemes";
import { PurchaseOrderFormModal } from "@/components/forms/PurchaseOrderFormModal";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";

export default function PurchaseOrders() {
  const { data: purchaseOrders, isLoading } = usePurchaseOrders();
  const { data: vendors } = useVendors();
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const createPurchaseOrder = useCreatePurchaseOrder();
  const updatePurchaseOrder = useUpdatePurchaseOrder();
  const deletePurchaseOrder = useDeletePurchaseOrder();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);

  const orderList = purchaseOrders || [];
  const vendorList = vendors || [];
  const projectList = projects || [];
  const schemeList = schemes || [];

  const enrichedOrders = orderList.map((order) => ({
    ...order,
    vendorName: vendorList.find((v) => v.id === order.vendor_id)?.name || "N/A",
    projectName: projectList.find((project) => project.id === order.project_id)?.name || "N/A",
    schemeName: schemeList.find((scheme) => (scheme.id || scheme._id) === order.scheme_id)?.name || "N/A",
  }));
  const procurementCount = orderList.filter((order) => order.source_type === "procurement").length;
  const projectCount = orderList.filter((order) => order.source_type === "project").length;
  const openOrderCount = orderList.filter((order) => String(order.status || "").toUpperCase() !== "COMPLETED").length;

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
      label: "Vendor / Project",
      render: (value: string, row: PurchaseOrder & { projectName?: string; schemeName?: string }) => (
        <span className="font-medium">
          {row.source_type === "project"
            ? `${row.projectName || "N/A"}${row.schemeName && row.schemeName !== "N/A" ? ` / ${row.schemeName}` : ""}`
            : value}
        </span>
      ),
    },
    {
      key: "source_name",
      label: "Procurement / Project Name",
      render: (value: string) => <span className="font-medium">{value || "N/A"}</span>,
    },
    {
      key: "order_date",
      label: "Order Date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "unit_price",
      label: "Unit Price",
      render: (value: number) => <span>PKR {Number(value || 0).toLocaleString("en-PK")}</span>,
    },
    {
      key: "total_amount",
      label: "Total Amount",
      render: (value: number) => (
        <span className="font-medium">PKR {value?.toLocaleString("en-PK") || 0}</span>
      ),
    },
    {
      key: "tax_amount",
      label: "Tax",
      render: (_: number, row: PurchaseOrder) => (
        <span>
          {Number(row.tax_percentage || 0).toFixed(2)}% (PKR {Number(row.tax_amount || 0).toLocaleString("en-PK")})
        </span>
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
        <span className="block max-w-[18rem] break-words text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {value || "—"}
        </span>
      ),
    },
  ];

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

  return (
    <MainLayout title="Purchase Orders" description="Manage vendor orders">
      <CollectionWorkspace
        title="Purchase Orders"
        description="Create and track purchase orders from vendors"
        eyebrow="Procurement workspace"
        meta={
          <>
            <span>{orderList.length} purchase orders in scope</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>Assets and consumables can bind to these records</span>
          </>
        }
        action={{
          label: "New Order",
          onClick: handleAddOrder,
        }}
        metrics={[
          { label: "Orders", value: orderList.length, helper: "Total purchase-order records loaded", icon: Eye, tone: "primary" },
          { label: "Procurement", value: procurementCount, helper: "Vendor procurement orders", icon: Pencil, tone: "success" },
          { label: "Project", value: projectCount, helper: "Project-linked order records", icon: MoreHorizontal },
          { label: "Open", value: openOrderCount, helper: "Orders not yet completed", icon: Loader2, tone: "warning" },
        ]}
        panelTitle="Purchase-order ledger"
        panelDescription="Track vendor and project orders in one operational ledger and keep linked procurement records easy to audit."
      >
        <DataTable
          columns={columns}
          data={enrichedOrders}
          searchPlaceholder="Search orders..."
          actions={actions as any}
        />
      </CollectionWorkspace>

      <PurchaseOrderFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        purchaseOrder={editingOrder}
        vendors={vendorList}
        projects={projectList}
        schemes={schemeList}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
