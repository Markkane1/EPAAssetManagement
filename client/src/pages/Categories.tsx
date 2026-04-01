import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCategoryCounts,
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/hooks/useCategories";
import { CategoryFormModal } from "@/components/forms/CategoryFormModal";
import { Category } from "@/types";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { DataTable } from "@/components/shared/DataTable";
import { useAuth } from "@/contexts/AuthContext";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";

const EMPTY_CATEGORIES: Category[] = [];

export default function Categories() {
  const { isOrgAdmin } = useAuth();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { mode: viewMode, setMode: setViewMode } = useViewMode("categories");
  const pageSearch = usePageSearch();
  const searchTerm = useDeferredValue((pageSearch?.term || "").trim());
  const [tableDisplay, setTableDisplay] = useState<{
    filteredCount: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
  } | null>(null);
  const { data: categoriesResponse, isLoading } = useCategories({
    search: searchTerm || undefined,
  });
  const visibleCategories = useMemo(() => categoriesResponse ?? EMPTY_CATEGORIES, [categoriesResponse]);
  const pagedCategories = useMemo(
    () => visibleCategories.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleCategories]
  );
  const totalCategories = visibleCategories.length;
  const totalPages = Math.max(1, Math.ceil(totalCategories / pageSize));
  const displayCount = tableDisplay?.filteredCount ?? totalCategories;
  const displayTotalPages = tableDisplay?.totalPages ?? totalPages;
  const displayRangeStart = viewMode === "list"
    ? (tableDisplay?.rangeStart ?? (displayCount === 0 ? 0 : (page - 1) * pageSize + 1))
    : totalCategories === 0 ? 0 : (page - 1) * pageSize + 1;
  const displayRangeEnd = viewMode === "list"
    ? (tableDisplay?.rangeEnd ?? Math.min(page * pageSize, displayCount))
    : Math.min(page * pageSize, totalCategories);
  const categoryIds = useMemo(() => visibleCategories.map((category) => category.id), [visibleCategories]);
  const { data: categoryCounts, isLoading: isCountsLoading } = useCategoryCounts(categoryIds);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const assetCountByCategoryId = useMemo(
    () => categoryCounts?.assets || {},
    [categoryCounts]
  );
  const consumableCountByCategoryId = useMemo(
    () => categoryCounts?.consumables || {},
    [categoryCounts]
  );

  const getCategoryItemCount = (category: Category) => {
    if (category.asset_type === "CONSUMABLE") {
      return consumableCountByCategoryId[category.id] || 0;
    }
    return assetCountByCategoryId[category.id] || 0;
  };
  const consumableCategoryCount = visibleCategories.filter((category) => category.asset_type === "CONSUMABLE").length;
  const labOnlyCount = visibleCategories.filter((category) => category.scope === "LAB_ONLY").length;
  const totalVisibleSubcategories = visibleCategories.reduce(
    (sum, category) => sum + (category.subcategories?.length || 0),
    0
  );

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: {
    name: string;
    description?: string;
    subcategories?: string[];
    scope: "GENERAL" | "LAB_ONLY";
    assetType: "ASSET" | "CONSUMABLE";
  }) => {
    if (editingCategory) {
      await updateCategory.mutateAsync({ id: editingCategory.id, data });
    } else {
      await createCategory.mutateAsync(data);
      setPage(1);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      deleteCategory.mutate(id);
    }
  };

  const columns = [
    {
      key: "name",
      label: "Category",
      render: (value: string, row: Category) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{row.description || "No description"}</p>
        </div>
      ),
    },
    {
      key: "subcategories",
      label: "Subcategories",
      render: (value: string[] | null | undefined) => {
        const subcategories = value || [];
        if (subcategories.length === 0) {
          return <span className="text-sm text-muted-foreground">No subcategories</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {subcategories.slice(0, 3).map((subcategory) => (
              <Badge key={subcategory} variant="secondary">{subcategory}</Badge>
            ))}
            {subcategories.length > 3 && (
              <Badge variant="outline">+{subcategories.length - 3} more</Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "asset_type",
      label: "Type",
      render: (value: string | null | undefined) => (
        <Badge variant={value === "CONSUMABLE" ? "default" : "outline"}>
          {value === "CONSUMABLE" ? "Consumable" : "Moveable"}
        </Badge>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      render: (value: string | null | undefined) => (
        <Badge variant={value === "LAB_ONLY" ? "destructive" : "secondary"}>
          {value === "LAB_ONLY" ? "Lab Only" : "General"}
        </Badge>
      ),
    },
    {
      key: "id",
      label: "Items",
      render: (_value: string, row: Category) => {
        const count = getCategoryItemCount(row);
        const noun = row.asset_type === "CONSUMABLE" ? "consumables" : "assets";
        return (
          <span className="text-sm">
            <span className="font-semibold">{count}</span>
            <span className="text-muted-foreground ml-1">{noun}</span>
          </span>
        );
      },
    },
  ];

  const actions = (category: Category) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEdit(category)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        {isOrgAdmin && (
          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(category.id)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading || isCountsLoading) {
    return (
      <MainLayout title="Categories" description="Organize categories by module">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Categories" description="Organize categories by module">
      <CollectionWorkspace
        title="Categories"
        description="View and manage moveable and consumable categories"
        eyebrow="Classification workspace"
        meta={
          <>
            <span>{totalCategories} visible categories</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{viewMode === "list" ? "Operational list view" : "Browse category cards"}</span>
          </>
        }
        action={{ label: "Add Category", onClick: handleAddCategory }}
        extra={<ViewModeToggle mode={viewMode} onModeChange={setViewMode} />}
        metrics={[
          { label: "Visible categories", value: totalCategories, helper: "Current category records in scope", icon: Package, tone: "primary" },
          { label: "Consumable", value: consumableCategoryCount, helper: "Categories tied to consumable stock", icon: MoreHorizontal, tone: "success" },
          { label: "Lab only", value: labOnlyCount, helper: "Categories limited to lab workflows", icon: Trash2, tone: "warning" },
          { label: "Subcategories", value: totalVisibleSubcategories, helper: "Nested subcategory definitions in view", icon: Pencil },
        ]}
        panelTitle="Category library"
        panelDescription="Manage the category taxonomy in one worklist, with the same dashboard-aligned shell used across operational modules."
      >
        {viewMode === "list" ? (
          <DataTable
            columns={columns}
            data={visibleCategories}
            pagination={false}
            externalPage={page}
            pageSize={pageSize}
            searchable={false}
            useGlobalPageSearch={false}
            actions={actions}
            pageSizeOptions={[10, 20, 50, 100]}
            onExternalPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            onDisplayStateChange={setTableDisplay}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pagedCategories.map((category) => (
                <Card key={category.id} className="group hover:shadow-md transition-all animate-fade-in">
                  <CardContent className="p-6">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                        <Package className="h-6 w-6 text-accent-foreground" />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(category)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {isOrgAdmin && (
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(category.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <h3 className="mb-1 text-lg font-semibold">{category.name}</h3>
                    <div className="mb-2 flex gap-2">
                      <Badge variant={category.asset_type === "CONSUMABLE" ? "default" : "outline"}>
                        {category.asset_type === "CONSUMABLE" ? "Consumable" : "Moveable"}
                      </Badge>
                      <Badge variant={category.scope === "LAB_ONLY" ? "destructive" : "secondary"}>
                        {category.scope === "LAB_ONLY" ? "Lab Only" : "General"}
                      </Badge>
                    </div>
                    <p className="mb-4 text-sm text-muted-foreground">{category.description}</p>
                    {(category.subcategories || []).length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {(category.subcategories || []).map((subcategory) => (
                          <Badge key={subcategory} variant="secondary">{subcategory}</Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 border-t pt-4">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <span className="font-semibold">{getCategoryItemCount(category)}</span>
                        <span className="ml-1 text-muted-foreground">
                          {category.asset_type === "CONSUMABLE" ? "consumables" : "assets"}
                        </span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {pagedCategories.length === 0 && (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  No categories found.
                </CardContent>
              </Card>
            )}
          </>
        )}
        <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Showing {displayRangeStart} to {displayRangeEnd} of {viewMode === "list" ? displayCount : totalCategories} categories
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm font-medium">
              Page {page} of {viewMode === "list" ? displayTotalPages : totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((current) => Math.min(viewMode === "list" ? displayTotalPages : totalPages, current + 1))}
              disabled={page >= (viewMode === "list" ? displayTotalPages : totalPages)}
            >
              Next
            </Button>
          </div>
        </div>
      </CollectionWorkspace>

      <CategoryFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        category={editingCategory}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
