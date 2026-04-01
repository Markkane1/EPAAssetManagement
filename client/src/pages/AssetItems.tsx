import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Eye, Pencil, UserPlus, Loader2, History, QrCode, Boxes, ShieldCheck, BriefcaseBusiness } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetItem } from "@/types";
import { useAssetItems, useCreateAssetItem, useUpdateAssetItem } from "@/hooks/useAssetItems";
import { useAssets } from "@/hooks/useAssets";
import { useCategories } from "@/hooks/useCategories";
import { useLocations } from "@/hooks/useLocations";
import { useAssignments, useCreateAssignment } from "@/hooks/useAssignments";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { useSchemes } from "@/hooks/useSchemes";
import { AssetItemFormModal } from "@/components/forms/AssetItemFormModal";
import { AssetItemEditModal } from "@/components/forms/AssetItemEditModal";
import { OfficeAssetItemFormModal } from "@/components/forms/OfficeAssetItemFormModal";
import { OfficeAssetItemEditModal } from "@/components/forms/OfficeAssetItemEditModal";
import { AssignmentHistoryModal } from "@/components/shared/AssignmentHistoryModal";
import { QRCodeModal } from "@/components/shared/QRCodeModal";
import { AssignmentFormModal } from "@/components/forms/AssignmentFormModal";
import { getOfficeHolderId, isStoreHolder } from "@/lib/assetItemHolder";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { normalizeSearchText, normalizeWhitespace } from "@/lib/textNormalization";
import { isAssetItemAssignable } from "@/lib/assetItemStatusRules";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";

export default function AssetItems() {
  const { isOrgAdmin } = useAuth();
  const officeScopedMode = !isOrgAdmin;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [detailModal, setDetailModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });
  const [assignmentModal, setAssignmentModal] = useState<{ open: boolean; item: AssetItem | null }>({
    open: false,
    item: null,
  });
  const [historyModal, setHistoryModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });
  const [qrModal, setQrModal] = useState<{ open: boolean; item: any | null }>({
    open: false,
    item: null,
  });
  const pageSearch = usePageSearch();
  const searchTerm = useDeferredValue((pageSearch?.term || "").trim());
  const [tableDisplay, setTableDisplay] = useState<{
    filteredCount: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const { data: assetItems, isLoading } = useAssetItems({
    search: searchTerm || undefined,
    categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    subcategory: subcategoryFilter !== "all" ? subcategoryFilter : undefined,
    assetName: assetFilter !== "all" ? assetFilter : undefined,
  });
  const { data: assets } = useAssets({
    categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    subcategory: subcategoryFilter !== "all" ? subcategoryFilter : undefined,
  });
  const { data: categories } = useCategories({ assetType: "ASSET" });
  const { data: locations } = useLocations();
  const { data: assignments } = useAssignments({ enabled: historyModal.open });
  const { data: employees } = useEmployees({ enabled: assignmentModal.open || historyModal.open });
  const { data: projects } = useProjects();
  const { data: schemes } = useSchemes();
  const createAssetItem = useCreateAssetItem();
  const updateAssetItem = useUpdateAssetItem();
  const createAssignment = useCreateAssignment();

  const assetItemList = assetItems || [];
  const assetList = assets || [];
  const categoryList = categories || [];
  const locationList = locations || [];
  const assignmentList = assignments || [];
  const employeeList = employees || [];
  const totalAssetItems = assetItemList.length;
  const totalPages = Math.max(1, Math.ceil(totalAssetItems / pageSize));
  const displayCount = tableDisplay?.filteredCount ?? totalAssetItems;
  const displayTotalPages = tableDisplay?.totalPages ?? totalPages;
  const displayRangeStart = tableDisplay?.rangeStart ?? (displayCount === 0 ? 0 : (page - 1) * pageSize + 1);
  const displayRangeEnd = tableDisplay?.rangeEnd ?? Math.min(page * pageSize, displayCount);

  const assetById = useMemo(() => new Map(assetList.map((asset) => [asset.id, asset])), [assetList]);
  const categoryById = useMemo(() => new Map(categoryList.map((category) => [category.id, category])), [categoryList]);
  const projectById = useMemo(() => new Map((projects || []).map((project) => [project.id, project])), [projects]);
  const schemeById = useMemo(() => new Map((schemes || []).map((scheme) => [scheme.id, scheme])), [schemes]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, subcategoryFilter, assetFilter, searchTerm]);

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

  const availableSubcategories = useMemo(() => {
    if (categoryFilter !== "all") {
      return categoryById.get(categoryFilter)?.subcategories || [];
    }

    return Array.from(new Set(categoryList.flatMap((category) => category.subcategories || []))).sort((left, right) =>
      left.localeCompare(right)
    );
  }, [categoryById, categoryFilter, categoryList]);

  useEffect(() => {
    if (subcategoryFilter === "all") return;
    if (!availableSubcategories.includes(subcategoryFilter)) {
      setSubcategoryFilter("all");
    }
  }, [availableSubcategories, subcategoryFilter]);

  const availableAssets = useMemo(() => {
    const seen = new Set<string>();
    const uniqueAssets: Array<{ name: string; sortKey: string }> = [];

    for (const asset of assetList) {
      if (categoryFilter !== "all" && asset.category_id !== categoryFilter) continue;
      if (subcategoryFilter !== "all" && (asset.subcategory || "") !== subcategoryFilter) continue;

      const displayName = normalizeWhitespace(asset.name);
      const sortKey = normalizeSearchText(asset.name);
      if (!displayName || seen.has(sortKey)) continue;
      seen.add(sortKey);
      uniqueAssets.push({ name: displayName, sortKey });
    }

    return uniqueAssets.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  }, [assetList, categoryFilter, subcategoryFilter]);

  useEffect(() => {
    if (assetFilter === "all") return;
    if (!availableAssets.some((asset) => asset.name === assetFilter)) {
      setAssetFilter("all");
    }
  }, [assetFilter, availableAssets]);

  const getSourceLabel = (item: AssetItem) => {
    const asset = assetById.get(item.asset_id);

    if (asset?.asset_source === "project") {
      const projectName = asset.project_id ? projectById.get(asset.project_id)?.name : null;
      const schemeName = asset.scheme_id ? schemeById.get(asset.scheme_id)?.name : null;

      if (projectName && schemeName) {
        return `${projectName} + ${schemeName}`;
      }

      return projectName || schemeName || "Project";
    }

    if (asset?.asset_source === "procurement") {
      return "Procurement";
    }

    return item.item_source || "N/A";
  };

  const enrichedItems = assetItemList.map((item) => ({
    ...item,
    assetName: assetById.get(item.asset_id)?.name || "N/A",
    categoryName: (assetById.get(item.asset_id)?.category_id
      ? categoryById.get(assetById.get(item.asset_id)?.category_id || "")?.name
      : null) || "N/A",
    subcategoryName: assetById.get(item.asset_id)?.subcategory || "N/A",
    locationName: isStoreHolder(item)
      ? "Head Office Store"
      : locationList.find((l) => l.id === getOfficeHolderId(item))?.name || "N/A",
  }));
  const assignedCount = enrichedItems.filter((item) => (item.assignment_status || "").toLowerCase() === "assigned").length;
  const functionalCount = enrichedItems.filter((item) => (item.functional_status || "").toLowerCase() === "functional").length;
  const assetCoverage = new Set(enrichedItems.map((item) => item.asset_id).filter(Boolean)).size;

  const columns = [
    { key: "tag", label: "Tag", render: (value: string) => <span className="font-mono font-medium text-primary">{value}</span> },
    {
      key: "categoryName",
      label: "Category",
      render: (value: string) => (
        <div className="table-pill max-w-[18rem] justify-start text-left">
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: "subcategoryName",
      label: "Subcategory",
      render: (value: string) => (
        <div className="table-pill max-w-[18rem] justify-start text-left">
          <span>{value}</span>
        </div>
      ),
    },
    { key: "assetName", label: "Asset", render: (value: string, row: any) => (
      <div className="min-w-[14rem]"><p className="font-medium">{value}</p><p className="text-xs text-muted-foreground">{row.serial_number}</p></div>
    )},
    { key: "locationName", label: "Location" },
    { key: "item_status", label: "Asset State", render: (value: string) => <StatusBadge status={value || ""} /> },
    { key: "assignment_status", label: "Custody", render: (value: string) => <StatusBadge status={value || ""} /> },
    { key: "functional_status", label: "Functional", render: (value: string) => <StatusBadge status={value || ""} /> },
    { key: "item_source", label: "Source", render: (_value: string, row: AssetItem) => (
      <span className="text-sm text-muted-foreground">{getSourceLabel(row)}</span>
    ) },
    { key: "warranty_expiry", label: "Warranty", render: (value: string | undefined) => {
      if (!value) return <span className="text-muted-foreground">N/A</span>;
      const expiry = new Date(value);
      return <span className={expiry < new Date() ? "text-destructive" : "text-muted-foreground"}>{expiry.toLocaleDateString()}</span>;
    }},
  ];

  const handleAddItem = () => {
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: {
    assetId: string;
    locationId: string;
    itemStatus: string;
    itemCondition: string;
    functionalStatus: string;
    notes?: string;
    items: Array<{ serialNumber: string; warrantyExpiry?: string }>;
  }) => {
    await createAssetItem.mutateAsync(data);
    setPage(1);
  };

  const handleEditSubmit = async (data: {
    assetId: string;
    locationId: string;
    serialNumber?: string | null;
    warrantyExpiry?: string | null;
    itemStatus: string;
    itemCondition: string;
    functionalStatus: string;
    notes?: string;
  }) => {
    if (!editModal.item) return;
    await updateAssetItem.mutateAsync({ id: editModal.item.id, data });
    setEditModal({ open: false, item: null });
  };

  const handleAssignmentSubmit = async (data: any) => {
    await createAssignment.mutateAsync(data);
  };

  const actions = (row: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setDetailModal({ open: true, item: row })}><Eye className="h-4 w-4 mr-2" /> View Details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setEditModal({ open: true, item: row })}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setHistoryModal({ open: true, item: row })}>
          <History className="h-4 w-4 mr-2" /> Assignment History
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setQrModal({ open: true, item: row })}>
          <QrCode className="h-4 w-4 mr-2" /> Generate QR Code
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isAssetItemAssignable(row) && (
          <DropdownMenuItem onClick={() => setAssignmentModal({ open: true, item: row })}>
            <UserPlus className="h-4 w-4 mr-2" /> Assign to Employee
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) return <MainLayout title="Asset Items" description="Track individual asset instances"><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></MainLayout>;
  return (
    <MainLayout
      title={officeScopedMode ? "Office Asset Items" : "Asset Items"}
      description={officeScopedMode ? "Track individual asset items located in your office" : "Track individual asset instances"}
    >
      <CollectionWorkspace
        title={officeScopedMode ? "Office Asset Items" : "Asset Items"}
        description={
          officeScopedMode
            ? "View and manage individual asset items for your office"
            : "View and manage individual asset items by serial number and tag"
        }
        eyebrow={officeScopedMode ? "Office item workspace" : "Asset item workspace"}
        meta={
          <>
            <span>{totalAssetItems} asset items in scope</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{officeScopedMode ? "Office-scoped item registry" : "Organization-wide serialized registry"}</span>
          </>
        }
        action={{ label: "Add Item", onClick: handleAddItem }}
        metrics={[
          { label: "Visible items", value: totalAssetItems, helper: "Serialized asset items in the current filtered view", icon: Boxes, tone: "primary" },
          { label: "Assigned", value: assignedCount, helper: "Items currently issued into custody", icon: BriefcaseBusiness, tone: "success" },
          { label: "Functional", value: functionalCount, helper: "Items marked functional and eligible for use", icon: ShieldCheck },
          { label: "Assets covered", value: assetCoverage, helper: "Distinct parent assets represented in this view", icon: Eye, tone: "warning" },
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
            <Select
              value={assetFilter}
              onValueChange={setAssetFilter}
              disabled={availableAssets.length === 0}
            >
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Filter by asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assets</SelectItem>
                {availableAssets.map((asset) => (
                  <SelectItem key={asset.name} value={asset.name}>{asset.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        panelTitle={officeScopedMode ? "Office item registry" : "Asset item registry"}
        panelDescription="Track serialized items with category, subcategory, parent asset, custody, and technical health visible in one dashboard-aligned worklist."
      >
        <DataTable
          columns={columns}
          data={enrichedItems}
          pagination={false}
          externalPage={page}
          pageSize={pageSize}
          searchable={false}
          useGlobalPageSearch={false}
          searchPlaceholder="Search by tag, serial number, or asset..."
          actions={actions}
          virtualized
          pageSizeOptions={[10, 20, 50, 100]}
          onExternalPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          onDisplayStateChange={setTableDisplay}
        />
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Showing {displayRangeStart} to {displayRangeEnd} of {displayCount} asset items
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
        <OfficeAssetItemFormModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          assets={assetList as any}
          locations={locationList as any}
          onSubmit={handleSubmit}
        />
      ) : (
        <AssetItemFormModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          assets={assetList as any}
          locations={locationList as any}
          onSubmit={handleSubmit}
        />
      )}

      {officeScopedMode ? (
        <OfficeAssetItemEditModal
          open={editModal.open}
          onOpenChange={(open) => setEditModal({ open, item: open ? editModal.item : null })}
          assetItem={editModal.item}
          assets={assetList as any}
          locations={locationList as any}
          onSubmit={handleEditSubmit}
        />
      ) : (
        <AssetItemEditModal
          open={editModal.open}
          onOpenChange={(open) => setEditModal({ open, item: open ? editModal.item : null })}
          assetItem={editModal.item}
          assets={assetList as any}
          locations={locationList as any}
          onSubmit={handleEditSubmit}
        />
      )}

      {detailModal.item && (
        <Dialog open={detailModal.open} onOpenChange={(open) => setDetailModal({ open, item: open ? detailModal.item : null })}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Asset Item Details</DialogTitle>
              <DialogDescription>
                View key information for this asset item.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tag</span>
                <span className="font-mono font-medium">{detailModal.item.tag || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Category</span>
                <span>{detailModal.item.categoryName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subcategory</span>
                <span>{detailModal.item.subcategoryName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Asset</span>
                <span className="font-medium">{detailModal.item.assetName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Serial Number</span>
                <span>{detailModal.item.serial_number || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Location</span>
                <span>{detailModal.item.locationName || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Asset State</span>
                <span>{detailModal.item.item_status || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Condition</span>
                <span>{detailModal.item.item_condition || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Functional Status</span>
                <span>{detailModal.item.functional_status || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Custody Status</span>
                <span>{detailModal.item.assignment_status || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Warranty Expiry</span>
                <span>
                  {detailModal.item.warranty_expiry
                    ? new Date(detailModal.item.warranty_expiry).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Notes</span>
                <span className="text-right">{detailModal.item.notes || "N/A"}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AssignmentFormModal
        open={assignmentModal.open}
        onOpenChange={(open) => setAssignmentModal({ open, item: open ? assignmentModal.item : null })}
        assetItems={assetItemList as any}
        employees={employeeList as any}
        assets={assetList as any}
        selectedAssetItem={assignmentModal.item}
        onSubmit={handleAssignmentSubmit}
      />

      {/* Assignment History Modal */}
      {historyModal.item && (
        <AssignmentHistoryModal
          open={historyModal.open}
          onOpenChange={(open) => setHistoryModal({ ...historyModal, open })}
          type="assetItem"
          targetId={historyModal.item.id}
          targetName={historyModal.item.tag || historyModal.item.serial_number || "Asset Item"}
          assignments={assignmentList}
          assetItems={assetItemList}
          employees={employeeList}
          assets={assetList}
        />
      )}

      {/* QR Code Modal */}
      {qrModal.item && (
        <QRCodeModal
          open={qrModal.open}
          onOpenChange={(open) => setQrModal({ ...qrModal, open })}
          tag={qrModal.item.tag || "N/A"}
          assetName={qrModal.item.assetName || "Unknown Asset"}
          serialNumber={qrModal.item.serial_number}
        />
      )}
    </MainLayout>
  );
}
