import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
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
  usePagedCategories,
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

const EMPTY_CATEGORIES: Category[] = [];

export default function Categories() {
  const PAGE_SIZE = 60;
  const { isOrgAdmin } = useAuth();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [page, setPage] = useState(1);
  const { mode: viewMode, setMode: setViewMode } = useViewMode("categories");
  const pageSearch = usePageSearch();
  const searchTerm = useDeferredValue((pageSearch?.term || "").trim());
  const { data: categoriesResponse, isLoading } = usePagedCategories({
    page,
    limit: PAGE_SIZE,
    search: searchTerm || undefined,
  });
  const visibleCategories = useMemo(() => categoriesResponse?.items ?? EMPTY_CATEGORIES, [categoriesResponse?.items]);
  const totalCategories = categoriesResponse?.total || visibleCategories.length;
  const totalPages = Math.max(1, Math.ceil(totalCategories / PAGE_SIZE));
  const categoryIds = useMemo(() => visibleCategories.map((category) => category.id), [visibleCategories]);
  const { data: categoryCounts, isLoading: isCountsLoading } = useCategoryCounts(categoryIds);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

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

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: { name: string; description?: string; scope: "GENERAL" | "LAB_ONLY"; assetType: "ASSET" | "CONSUMABLE" }) => {
    if (editingCategory) {
      await updateCategory.mutateAsync({ id: editingCategory.id, data });
    } else {
      await createCategory.mutateAsync(data);
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
      <PageHeader
        title="Categories"
        description="View and manage moveable and consumable categories"
        action={{ label: "Add Category", onClick: handleAddCategory }}
        extra={<ViewModeToggle mode={viewMode} onModeChange={setViewMode} />}
      />

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={visibleCategories}
          pagination={false}
          searchable={false}
          useGlobalPageSearch={false}
          actions={actions}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleCategories.map((category) => (
              <Card key={category.id} className="group hover:shadow-md transition-all animate-fade-in">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Package className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
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

                  <h3 className="font-semibold text-lg mb-1">{category.name}</h3>
                  <div className="mb-2 flex gap-2">
                    <Badge variant={category.asset_type === "CONSUMABLE" ? "default" : "outline"}>
                      {category.asset_type === "CONSUMABLE" ? "Consumable" : "Moveable"}
                    </Badge>
                    <Badge variant={category.scope === "LAB_ONLY" ? "destructive" : "secondary"}>
                      {category.scope === "LAB_ONLY" ? "Lab Only" : "General"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{category.description}</p>

                  <div className="flex items-center gap-2 pt-4 border-t">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      <span className="font-semibold">{getCategoryItemCount(category)}</span>
                      <span className="text-muted-foreground ml-1">
                        {category.asset_type === "CONSUMABLE" ? "consumables" : "assets"}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {visibleCategories.length === 0 && (
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
          Showing {visibleCategories.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{" "}
          {Math.min(page * PAGE_SIZE, totalCategories)} of {totalCategories} categories
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

      <CategoryFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        category={editingCategory}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
