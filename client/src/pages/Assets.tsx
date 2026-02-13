import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Asset } from "@/types";
import { useNavigate } from "react-router-dom";
import { useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset } from "@/hooks/useAssets";
import { useCategories } from "@/hooks/useCategories";
import { useVendors } from "@/hooks/useVendors";
import { useProjects } from "@/hooks/useProjects";
import { useSchemes } from "@/hooks/useSchemes";
import { AssetFormModal } from "@/components/forms/AssetFormModal";
import { exportToCSV, exportToJSON, filterRowsBySearch, formatDateForExport, formatCurrencyForExport, pickExportFields } from "@/lib/exportUtils";
import { usePageSearch } from "@/contexts/PageSearchContext";

export default function Assets() {
  const navigate = useNavigate();
  
  const { data: assets, isLoading, error } = useAssets();
  const { data: categories } = useCategories();
  const { data: vendors } = useVendors();
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  const pageSearch = usePageSearch();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const assetList = assets || [];
  const categoryList = categories || [];
  const vendorList = vendors || [];
  const projectList = projects || [];
  const schemeList = schemes || [];

  const enrichedAssets = assetList.map((asset) => {
    const vendor = vendorList.find((v) => v.id === asset.vendor_id);
    const project = projectList.find((p) => p.id === asset.project_id);
    const scheme = schemeList.find((s) => s.id === asset.scheme_id);
    const sourceLabel = asset.asset_source === "project" ? "Project" : "Procurement";
    const sourceDetail = asset.asset_source === "project"
      ? `${project?.name || "N/A"}${scheme ? ` · ${scheme.name}` : ""}`
      : vendor?.name || "N/A";

    return {
      ...asset,
      categoryName: categoryList.find((c) => c.id === asset.category_id)?.name || "N/A",
      vendorName: vendor?.name || "N/A",
      sourceLabel,
      sourceDetail,
    };
  });

  const columns = [
    { key: "name", label: "Asset Name", render: (value: string, row: Asset) => (
      <div><p className="font-medium">{value}</p><p className="text-xs text-muted-foreground truncate max-w-[200px]">{row.description}</p></div>
    )},
    { key: "categoryName", label: "Category", render: (value: string) => <Badge variant="secondary" className="font-normal">{value}</Badge> },
    { key: "sourceLabel", label: "Source", render: (value: string) => <Badge variant="outline" className="font-normal">{value}</Badge> },
    { key: "sourceDetail", label: "Vendor/Project" },
    { key: "quantity", label: "Quantity", render: (value: number) => <span className="font-medium">{value}</span> },
    { key: "unit_price", label: "Unit Price", render: (value: number) => <span className="font-medium">PKR {value?.toLocaleString("en-PK") || 0}</span> },
    { key: "acquisition_date", label: "Acquired", render: (value: string) => value ? new Date(value).toLocaleDateString() : "N/A" },
  ];

  const filteredAssets = useMemo(
    () => filterRowsBySearch(enrichedAssets as any, pageSearch?.term || ""),
    [enrichedAssets, pageSearch?.term],
  );

  const handleAddAsset = () => {
    setEditingAsset(null);
    setIsModalOpen(true);
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingAsset) {
      await updateAsset.mutateAsync({ id: editingAsset.id, data });
    } else {
      await createAsset.mutateAsync(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this asset?")) {
      deleteAsset.mutate(id);
    }
  };

  const actions = (row: Asset) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate(`/assets/${row.id}`)}><Eye className="h-4 w-4 mr-2" /> View Details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEdit(row)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row.id)}><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Assets" description="Manage your asset catalog">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) console.warn("API unavailable:", error);

  const handleExportCSV = () => {
    exportToCSV(
      filteredAssets as any,
      [
        { key: "name", header: "Asset Name" },
        { key: "categoryName", header: "Category" },
        { key: "sourceLabel", header: "Source" },
        { key: "sourceDetail", header: "Vendor/Project" },
        { key: "quantity", header: "Quantity" },
        { key: "unit_price", header: "Unit Price", formatter: (v) => formatCurrencyForExport(v as number) },
        { key: "acquisition_date", header: "Acquired", formatter: (v) => formatDateForExport(v as Date) },
      ],
      "assets",
    );
  };

  const handleExportJSON = () => {
    exportToJSON(
      pickExportFields(filteredAssets as any, [
        "name",
        "categoryName",
        "sourceLabel",
        "sourceDetail",
        "quantity",
        "unit_price",
        "acquisition_date",
      ]),
      "assets",
    );
  };

  return (
    <MainLayout title="Assets" description="Manage your asset catalog">
      <PageHeader 
        title="Assets" 
        description="View and manage all asset types in your organization" 
        action={{ label: "Add Asset", onClick: handleAddAsset }}
        extra={<ExportButton onExportCSV={handleExportCSV} onExportJSON={handleExportJSON} />}
      />
      <DataTable columns={columns} data={enrichedAssets} searchPlaceholder="Search assets..." onRowClick={(row) => navigate(`/assets/${row.id}`)} actions={actions} />
      <AssetFormModal open={isModalOpen} onOpenChange={setIsModalOpen} asset={editingAsset as any} categories={categoryList as any[]} vendors={vendorList as any[]} projects={projectList as any[]} schemes={schemeList as any[]} onSubmit={handleSubmit} />
    </MainLayout>
  );
}
