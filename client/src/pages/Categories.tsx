import { useMemo, useState } from "react";
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
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useCategories";
import { CategoryFormModal } from "@/components/forms/CategoryFormModal";
import { Category } from "@/types";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { DataTable } from "@/components/shared/DataTable";


export default function Categories() {
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const { mode: viewMode, setMode: setViewMode } = useViewMode("categories");
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();

  const filteredCategories = useMemo(
    () =>
      (categories || []).filter((category) => {
        if (!searchTerm) return true;
        return [category.name, category.description, category.scope, category.asset_type]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm);
      }),
    [categories, searchTerm]
  );

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
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(category.id)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
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
          data={filteredCategories}
          searchable={false}
          useGlobalPageSearch={false}
          actions={actions}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCategories.map((category) => (
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
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(category.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
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
                      <span className="font-semibold">0</span>
                      <span className="text-muted-foreground ml-1">assets</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredCategories.length === 0 && (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No categories found.
              </CardContent>
            </Card>
          )}
        </>
      )}

      <CategoryFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        category={editingCategory}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
