import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
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
import { usePagedAssets, useCreateAsset, useUpdateAsset, useDeleteAsset } from "@/hooks/useAssets";
import { useCategories } from "@/hooks/useCategories";
import { useVendors } from "@/hooks/useVendors";
import { useProjects } from "@/hooks/useProjects";
import { useSchemes } from "@/hooks/useSchemes";
import { AssetFormModal } from "@/components/forms/AssetFormModal";
import { OfficeAssetFormModal } from "@/components/forms/OfficeAssetFormModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSearch } from "@/contexts/PageSearchContext";

const EMPTY_ASSETS: Asset[] = [];
const EMPTY_LIST: never[] = [];

function formatDimensions(asset: Asset) {
  const dims = asset.dimensions;
  if (!dims) return "N/A";
  const values = [dims.length, dims.width, dims.height];
  if (values.every((value) => value === null || value === undefined)) return "N/A";
  const [l, w, h] = values.map((value) => (value ?? "-"));
  return `${l} x ${w} x ${h} ${dims.unit || "cm"}`;
}

export default function Assets() {
  const PAGE_SIZE = 60;
  const navigate = useNavigate();
  const { isOrgAdmin } = useAuth();
  const officeScopedMode = !isOrgAdmin;
  const [page, setPage] = useState(1);
  const pageSearch = usePageSearch();
  const searchTerm = useDeferredValue((pageSearch?.term || "").trim());

  const { data: assetsResponse, isLoading } = usePagedAssets({
    page,
    limit: PAGE_SIZE,
    search: searchTerm || undefined,
  });
  const { data: categories } = useCategories({ assetType: "ASSET" });
  const { data: vendors } = useVendors();
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const assetList = assetsResponse?.items ?? EMPTY_ASSETS;
  const categoryList = useMemo(() => categories ?? EMPTY_LIST, [categories]);
  const vendorList = useMemo(() => vendors ?? EMPTY_LIST, [vendors]);
  const projectList = useMemo(() => projects ?? EMPTY_LIST, [projects]);
  const schemeList = useMemo(() => schemes ?? EMPTY_LIST, [schemes]);
  const totalAssets = assetsResponse?.total || assetList.length;
  const totalPages = Math.max(1, Math.ceil(totalAssets / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const categoryById = useMemo(() => new Map(categoryList.map((category) => [category.id, category])), [categoryList]);
  const vendorById = useMemo(() => new Map(vendorList.map((vendor) => [vendor.id, vendor])), [vendorList]);
  const projectById = useMemo(() => new Map(projectList.map((project) => [project.id, project])), [projectList]);
  const schemeById = useMemo(() => new Map(schemeList.map((scheme) => [scheme.id, scheme])), [schemeList]);

  const enrichedAssets = assetList.map((asset) => {
    const vendor = asset.vendor_id ? vendorById.get(asset.vendor_id) : undefined;
    const project = asset.project_id ? projectById.get(asset.project_id) : undefined;
    const scheme = asset.scheme_id ? schemeById.get(asset.scheme_id) : undefined;
    const sourceLabel = officeScopedMode
      ? "Procurement"
      : asset.asset_source === "project"
        ? "Project"
        : "Procurement";
    const sourceDetail = officeScopedMode
      ? vendor?.name || "N/A"
      : asset.asset_source === "project"
        ? `${project?.name || "N/A"}${scheme ? ` - ${scheme.name}` : ""}`
        : vendor?.name || "N/A";

    return {
      ...asset,
      categoryName: (asset.category_id ? categoryById.get(asset.category_id)?.name : null) || "N/A",
      vendorName: vendor?.name || "N/A",
      sourceLabel,
      sourceDetail,
      dimensionsLabel: formatDimensions(asset),
    };
  });

  const columns = [
    {
      key: "name",
      label: "Asset Name",
      render: (value: string, row: Asset) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{row.description}</p>
        </div>
      ),
    },
    {
      key: "categoryName",
      label: "Category",
      render: (value: string) => <Badge variant="secondary" className="font-normal">{value}</Badge>,
    },
    {
      key: "sourceLabel",
      label: "Source",
      render: (value: string) => <Badge variant="outline" className="font-normal">{value}</Badge>,
    },
    { key: "sourceDetail", label: "Vendor/Project" },
    { key: "dimensionsLabel", label: "Dimensions" },
    { key: "quantity", label: "Quantity", render: (value: number) => <span className="font-medium">{value}</span> },
    {
      key: "unit_price",
      label: "Unit Price",
      render: (value: number) => <span className="font-medium">PKR {value?.toLocaleString("en-PK") || 0}</span>,
    },
    {
      key: "acquisition_date",
      label: "Acquired",
      render: (value: string) => (value ? new Date(value).toLocaleDateString() : "N/A"),
    },
  ];

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

  return (
    <MainLayout
      title={officeScopedMode ? "Office Assets" : "Assets"}
      description={officeScopedMode ? "Manage your office's asset catalog" : "Manage your asset catalog"}
    >
      <PageHeader
        title={officeScopedMode ? "Office Assets" : "Assets"}
        description={
          officeScopedMode
            ? "View and manage asset definitions for your office"
            : "View and manage all asset types in your organization"
        }
        action={{ label: officeScopedMode ? "Add Procurement Asset" : "Add Asset", onClick: handleAddAsset }}
      />
      <DataTable
        columns={columns}
        data={enrichedAssets}
        pagination={false}
        searchable={false}
        useGlobalPageSearch={false}
        searchPlaceholder="Search assets..."
        onRowClick={(row) => navigate(`/assets/${row.id}`)}
        actions={actions}
      />
      <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Showing {assetList.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{" "}
          {Math.min(page * PAGE_SIZE, totalAssets)} of {totalAssets} assets
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
            Previous
          </Button>
          <span className="text-sm font-medium">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
      {officeScopedMode ? (
        <OfficeAssetFormModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          asset={editingAsset as any}
          categories={categoryList as any[]}
          vendors={vendorList as any[]}
          onSubmit={handleSubmit}
        />
      ) : (
        <AssetFormModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          asset={editingAsset as any}
          categories={categoryList as any[]}
          vendors={vendorList as any[]}
          projects={projectList as any[]}
          schemes={schemeList as any[]}
          onSubmit={handleSubmit}
        />
      )}
    </MainLayout>
  );
}
