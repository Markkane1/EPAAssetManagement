import { useMemo, useState } from "react";
import { FolderTree, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { MainLayout } from "@/components/layout/MainLayout";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories, useUpdateCategory } from "@/hooks/useCategories";
import { SubcategoryFormModal } from "@/components/forms/SubcategoryFormModal";
import type { Category, CategoryAssetType } from "@/types";
import { CollectionWorkspace } from "@/components/shared/CollectionWorkspace";

type AssetTypeFilter = CategoryAssetType | "ALL";

type SubcategoryRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  assetType: CategoryAssetType;
  scope: "GENERAL" | "LAB_ONLY";
};

function normalizeSubcategories(input: string[] | null | undefined) {
  const seen = new Set<string>();
  return (input || [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function Subcategories() {
  const navigate = useNavigate();
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<{
    categoryId: string;
    previousCategoryId: string;
    name: string;
    previousName: string;
  } | null>(null);

  const { data: categories = [], isLoading } = useCategories(
    assetTypeFilter === "ALL" ? undefined : { assetType: assetTypeFilter }
  );
  const updateCategory = useUpdateCategory();

  const rows = useMemo<SubcategoryRow[]>(() => {
    return categories
      .flatMap((category) =>
        normalizeSubcategories(category.subcategories).map((subcategory) => ({
          id: `${category.id}:${subcategory.toLowerCase()}`,
          categoryId: category.id,
          categoryName: category.name,
          name: subcategory,
          assetType: category.asset_type || "ASSET",
          scope: category.scope || "GENERAL",
        }))
      )
      .sort((left, right) => {
        if (left.categoryName !== right.categoryName) {
          return left.categoryName.localeCompare(right.categoryName);
        }
        return left.name.localeCompare(right.name);
      });
  }, [categories]);
  const consumableRowCount = rows.filter((row) => row.assetType === "CONSUMABLE").length;
  const labOnlyRowCount = rows.filter((row) => row.scope === "LAB_ONLY").length;
  const categoryCoverage = new Set(rows.map((row) => row.categoryId)).size;

  const handleAdd = () => {
    setEditingSubcategory(null);
    setModalOpen(true);
  };

  const handleEdit = (row: SubcategoryRow) => {
    setEditingSubcategory({
      categoryId: row.categoryId,
      previousCategoryId: row.categoryId,
      name: row.name,
      previousName: row.name,
    });
    setModalOpen(true);
  };

  const handleDelete = async (row: SubcategoryRow) => {
    const category = categories.find((entry) => entry.id === row.categoryId);
    if (!category) return;
    if (!confirm(`Delete subcategory "${row.name}" from "${row.categoryName}"?`)) return;

    const nextSubcategories = normalizeSubcategories(category.subcategories).filter(
      (entry) => entry.toLowerCase() !== row.name.toLowerCase()
    );

    await updateCategory.mutateAsync({
      id: category.id,
      data: {
        name: category.name,
        description: category.description || undefined,
        scope: category.scope || "GENERAL",
        assetType: category.asset_type || "ASSET",
        subcategories: nextSubcategories,
      },
    });
  };

  const handleSubmit = async (data: {
    categoryId: string;
    name: string;
    previousCategoryId?: string;
    previousName?: string;
  }) => {
    const targetCategory = categories.find((entry) => entry.id === data.categoryId);
    if (!targetCategory) {
      throw new Error("Category not found");
    }

    const sourceCategory = categories.find((entry) => entry.id === (data.previousCategoryId || data.categoryId));
    const normalizedName = data.name.trim();
    const sourceName = String(data.previousName || "").trim();

    const targetSubcategories = normalizeSubcategories(targetCategory.subcategories).filter(
      (entry) =>
        !(data.previousCategoryId === data.categoryId && sourceName && entry.toLowerCase() === sourceName.toLowerCase())
    );

    if (targetSubcategories.some((entry) => entry.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error(`"${normalizedName}" already exists in "${targetCategory.name}"`);
    }

    targetSubcategories.push(normalizedName);
    targetSubcategories.sort((left, right) => left.localeCompare(right));

    if (sourceCategory && sourceCategory.id !== targetCategory.id && sourceName) {
      const sourceSubcategories = normalizeSubcategories(sourceCategory.subcategories).filter(
        (entry) => entry.toLowerCase() !== sourceName.toLowerCase()
      );
      await updateCategory.mutateAsync({
        id: sourceCategory.id,
        data: {
          name: sourceCategory.name,
          description: sourceCategory.description || undefined,
          scope: sourceCategory.scope || "GENERAL",
          assetType: sourceCategory.asset_type || "ASSET",
          subcategories: sourceSubcategories,
        },
      });
    }

    await updateCategory.mutateAsync({
      id: targetCategory.id,
      data: {
        name: targetCategory.name,
        description: targetCategory.description || undefined,
        scope: targetCategory.scope || "GENERAL",
        assetType: targetCategory.asset_type || "ASSET",
        subcategories: targetSubcategories,
      },
    });
  };

  const columns = [
    {
      key: "name",
      label: "Subcategory",
      render: (value: string) => <span className="font-medium">{value}</span>,
    },
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
      key: "assetType",
      label: "Type",
      render: (value: CategoryAssetType) => (
        <Badge variant={value === "CONSUMABLE" ? "default" : "outline"}>
          {value === "CONSUMABLE" ? "Consumable" : "Moveable"}
        </Badge>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      render: (value: "GENERAL" | "LAB_ONLY") => (
        <Badge variant={value === "LAB_ONLY" ? "destructive" : "secondary"}>
          {value === "LAB_ONLY" ? "Lab Only" : "General"}
        </Badge>
      ),
    },
  ];

  const actions = (row: SubcategoryRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => void handleDelete(row)}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <MainLayout title="Subcategories" description="Manage subcategories under categories">
      <CollectionWorkspace
        title="Subcategories"
        description="Create, rename, move, and remove subcategories for moveable and consumable categories."
        eyebrow="Taxonomy workspace"
        meta={
          <>
            <span>{rows.length} subcategories in scope</span>
            <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>{assetTypeFilter === "ALL" ? "All category types" : `${assetTypeFilter.toLowerCase()} categories only`}</span>
          </>
        }
        action={{ label: "Add Subcategory", onClick: handleAdd }}
        extra={
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <Select value={assetTypeFilter} onValueChange={(value) => setAssetTypeFilter(value as AssetTypeFilter)}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All category types</SelectItem>
                <SelectItem value="ASSET">Moveable categories</SelectItem>
                <SelectItem value="CONSUMABLE">Consumable categories</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => navigate("/categories")}>
              <FolderTree className="h-4 w-4" />
              Categories
            </Button>
          </div>
        }
        metrics={[
          { label: "Visible subcategories", value: rows.length, helper: "Rows after the active type filter", icon: FolderTree, tone: "primary" },
          { label: "Categories covered", value: categoryCoverage, helper: "Parent categories represented in this view", icon: Pencil, tone: "success" },
          { label: "Consumable", value: consumableRowCount, helper: "Subcategories assigned to consumables", icon: Trash2 },
          { label: "Lab only", value: labOnlyRowCount, helper: "Restricted lab-only taxonomy rows", icon: MoreHorizontal, tone: "warning" },
        ]}
        panelTitle="Subcategory worklist"
        panelDescription="Maintain subcategory definitions in one table while keeping the category relationship visible and navigable."
      >
        <DataTable
          columns={columns}
          data={rows}
          searchable={!isLoading}
          searchPlaceholder="Search subcategories..."
          useGlobalPageSearch={false}
          actions={actions}
          emptyState={{
            title: "No subcategories found.",
            description: "Create a subcategory or adjust the current type filter.",
          }}
        />
      </CollectionWorkspace>

      <SubcategoryFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        categories={categories}
        selectedAssetType={assetTypeFilter}
        initialValue={editingSubcategory}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
