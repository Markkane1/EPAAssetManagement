import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Eye, Pencil, Trash2, Loader2, Boxes, FolderKanban, Tags } from "lucide-react";
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
import { OfficeAssetFormModal } from "@/components/forms/OfficeAssetFormModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";

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
  const navigate = useNavigate();
  const { isOrgAdmin } = useAuth();
  const officeScopedMode = !isOrgAdmin;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const pageSearch = usePageSearch();
  const searchTerm = useDeferredValue((pageSearch?.term || "").trim());

  const [tableDisplay, setTableDisplay] = useState<{
    filteredCount: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);

  const { data: assetsResponse, isLoading } = useAssets({
    search: searchTerm || undefined,
    categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    subcategory: subcategoryFilter !== "all" ? subcategoryFilter : undefined,
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

  const assetList = assetsResponse ?? EMPTY_ASSETS;
  const categoryList = useMemo(() => categories ?? EMPTY_LIST, [categories]);
  const vendorList = useMemo(() => vendors ?? EMPTY_LIST, [vendors]);
  const projectList = useMemo(() => projects ?? EMPTY_LIST, [projects]);
  const schemeList = useMemo(() => schemes ?? EMPTY_LIST, [schemes]);
  const totalAssets = assetList.length;
  const totalPages = Math.max(1, Math.ceil(totalAssets / pageSize));
  const displayCount = tableDisplay?.filteredCount ?? totalAssets;
  const displayTotalPages = tableDisplay?.totalPages ?? totalPages;
  const displayRangeStart = tableDisplay?.rangeStart ?? (displayCount === 0 ? 0 : (page - 1) * pageSize + 1);
  const displayRangeEnd = tableDisplay?.rangeEnd ?? Math.min(page * pageSize, displayCount);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, categoryFilter, subcategoryFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (categoryFilter === "all") return;
    if (!categoryList.some((category) => category.id === categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryList]);

  const categoryById = useMemo(() => new Map(categoryList.map((category) => [category.id, category])), [categoryList]);
  const vendorById = useMemo(() => new Map(vendorList.map((vendor) => [vendor.id, vendor])), [vendorList]);
  const projectById = useMemo(() => new Map(projectList.map((project) => [project.id, project])), [projectList]);
  const schemeById = useMemo(() => new Map(schemeList.map((scheme) => [scheme.id, scheme])), [schemeList]);

  const availableSubcategories = useMemo(() => {
    if (categoryFilter !== "all") {
      return categoryById.get(categoryFilter)?.subcategories || [];
    }

    return Array.from(
      new Set(
        categoryList.flatMap((category) => category.subcategories || [])
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [categoryById, categoryFilter, categoryList]);

  useEffect(() => {
    if (subcategoryFilter === "all") return;
    if (!availableSubcategories.includes(subcategoryFilter)) {
      setSubcategoryFilter("all");
    }
  }, [availableSubcategories, subcategoryFilter]);

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
      subcategoryName: asset.subcategory || "N/A",
      vendorName: vendor?.name || "N/A",
      sourceLabel,
      sourceDetail,
      dimensionsLabel: formatDimensions(asset),
    };
  });
  const procurementAssetCount = enrichedAssets.filter((asset) => asset.asset_source !== "project").length;
  const projectAssetCount = enrichedAssets.filter((asset) => asset.asset_source === "project").length;
  const categoryCoverage = new Set(enrichedAssets.map((asset) => asset.category_id).filter(Boolean)).size;

  const columns = [
    {
      key: "name",
      label: "Asset Name",
      render: (value: string, row: Asset) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="max-w-[18rem] break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {row.description}
          </p>
        </div>
      ),
    },
    {
      key: "categoryName",
      label: "Category",
      render: (value: string) => (
        <div className="table-pill max-w-[16rem] justify-start text-left">
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: "subcategoryName",
      label: "Subcategory",
      render: (value: string) => (
        <div className="table-pill max-w-[16rem] justify-start text-left">
          <span>{value}</span>
        </div>
      ),
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
      setPage(1);
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
      <CollectionWorkspace
        title={officeScopedMode ? "Office Assets" : "Assets"}
        description={
          officeScopedMode
            ? "View and manage asset definitions for your office"
            : "View and manage all asset types in your organization"
        }
        eyebrow={officeScopedMode ? "Office inventory workspace" : "Asset catalog workspace"}
        meta={
          <>
            <span>{totalAssets} assets in scope</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{officeScopedMode ? "Office-scoped procurement catalog" : "Organization-wide asset definitions"}</span>
          </>
        }
        action={{ label: officeScopedMode ? "Add Procurement Asset" : "Add Asset", onClick: handleAddAsset }}
        metrics={[
          { label: "Visible assets", value: totalAssets, helper: "Asset definitions in the current filtered view", icon: Boxes, tone: "primary" },
          { label: "Procurement", value: procurementAssetCount, helper: "Catalog entries sourced from procurement", icon: Tags, tone: "success" },
          { label: "Projects", value: projectAssetCount, helper: "Assets linked to project-backed procurement", icon: FolderKanban },
          { label: "Categories", value: categoryCoverage, helper: "Distinct categories represented in the filtered list", icon: Eye, tone: "warning" },
        ]}
        filterBar={
          <>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryList.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={subcategoryFilter}
              onValueChange={setSubcategoryFilter}
              disabled={availableSubcategories.length === 0}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Filter by subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subcategories</SelectItem>
                {availableSubcategories.map((subcategory) => (
                  <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        panelTitle={officeScopedMode ? "Office asset catalog" : "Asset catalog"}
        panelDescription="Manage asset definitions, keep category and subcategory groupings visible, and use the same workspace shell as the main dashboard."
      >
        <DataTable
          columns={columns}
          data={enrichedAssets}
          pagination={false}
          externalPage={page}
          pageSize={pageSize}
          searchable={false}
          useGlobalPageSearch={false}
          searchPlaceholder="Search assets..."
          onRowClick={(row) => navigate(`/assets/${row.id}`)}
          actions={actions}
          pageSizeOptions={[10, 20, 50, 100]}
          onExternalPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          onDisplayStateChange={setTableDisplay}
        />
        <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Showing {displayRangeStart} to {displayRangeEnd} of {displayCount} assets
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm font-medium">
              Page {page} of {displayTotalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((current) => Math.min(displayTotalPages, current + 1))}
              disabled={page >= displayTotalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </CollectionWorkspace>
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
