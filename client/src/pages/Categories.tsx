import { useState } from "react";
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

const categoryIcons = ["💻", "🖥️", "🪑", "🚗", "🌐", "🖨️"];

export default function Categories() {
  const { data: categories, isLoading, error } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const categoryList = categories || [];

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: { name: string; description?: string; scope: "GENERAL" | "LAB_ONLY" }) => {
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

  if (isLoading) {
    return (
      <MainLayout title="Categories" description="Organize assets by type">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (error) console.warn("API unavailable:", error);

  return (
    <MainLayout title="Categories" description="Organize assets by type">
      <PageHeader
        title="Categories"
        description="View and manage asset categories"
        action={{ label: "Add Category", onClick: handleAddCategory }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categoryList.map((category, index) => (
          <Card key={category.id} className="group hover:shadow-md transition-all animate-fade-in">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center text-2xl">
                  {categoryIcons[index % categoryIcons.length]}
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
              <div className="mb-2">
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

      <CategoryFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        category={editingCategory}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
