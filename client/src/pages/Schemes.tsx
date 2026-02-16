import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Scheme, Project } from "@/types";
import { SchemeFormModal } from "@/components/forms/SchemeFormModal";
import { useSchemes, useCreateScheme, useUpdateScheme, useDeleteScheme } from "@/hooks/useSchemes";
import { useProjects } from "@/hooks/useProjects";

export default function Schemes() {
  const { data: schemes, isLoading } = useSchemes();
  const { data: projects } = useProjects();
  const createScheme = useCreateScheme();
  const updateScheme = useUpdateScheme();
  const deleteScheme = useDeleteScheme();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);

  const schemeList = schemes || [];
  const projectList = projects || [];

  const projectMap = new Map(projectList.map((project) => [project.id, project.name]));

  const enrichedSchemes = schemeList.map((scheme) => ({
    ...scheme,
    projectName: projectMap.get(scheme.project_id) || "N/A",
  }));

  const handleAddScheme = () => {
    setEditingScheme(null);
    setIsModalOpen(true);
  };

  const handleEdit = (scheme: Scheme) => {
    setEditingScheme(scheme);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    if (editingScheme) {
      await updateScheme.mutateAsync({ id: editingScheme.id, data });
    } else {
      await createScheme.mutateAsync(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this scheme?")) {
      deleteScheme.mutate(id);
    }
  };

  const columns = [
    { key: "name", label: "Scheme", render: (value: string) => <span className="font-medium">{value}</span> },
    { key: "projectName", label: "Project" },
    { key: "description", label: "Description", render: (value: string) => <span className="text-muted-foreground">{value || "N/A"}</span> },
    {
      key: "is_active",
      label: "Status",
      render: (value: boolean) => (
        <Badge variant={value ? "default" : "secondary"} className={value ? "bg-success" : ""}>
          {value ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  const actions = (row: Scheme) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEdit(row)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(row.id)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Schemes" description="Manage project schemes">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Schemes" description="Manage project schemes">
      <PageHeader
        title="Schemes"
        description="Create and manage schemes under projects"
        action={{ label: "Add Scheme", onClick: handleAddScheme }}
      />

      <DataTable columns={columns} data={enrichedSchemes} searchPlaceholder="Search schemes..." actions={actions} />

      <SchemeFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        scheme={editingScheme}
        projects={projectList as Project[]}
        onSubmit={handleSubmit}
      />
    </MainLayout>
  );
}
