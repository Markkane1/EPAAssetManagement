import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderKanban, Calendar, MoreHorizontal, Pencil, Trash2, Eye, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useProjects,
  useProject,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "@/hooks/useProjects";
import { ProjectFormModal } from "@/components/forms/ProjectFormModal";
import { Project } from "@/types";
import { usePageSearch } from "@/contexts/PageSearchContext";
import { ViewModeToggle } from "@/components/shared/ViewModeToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { DataTable } from "@/components/shared/DataTable";

export default function Projects() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);
  const { mode: viewMode, setMode: setViewMode } = useViewMode("projects");
  const pageSearch = usePageSearch();
  const searchTerm = (pageSearch?.term || "").trim().toLowerCase();
  const {
    data: viewingProject,
    isLoading: isViewingProject,
    isError: isViewingProjectError,
  } = useProject(viewingProjectId || "");

  const filteredProjects = useMemo(
    () =>
      (projects || []).filter((project) => {
        if (!searchTerm) return true;
        return [project.code, project.name, project.description, project.is_active ? "active" : "inactive"]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm);
      }),
    [projects, searchTerm]
  );

  const handleAddProject = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const handleView = (projectId: string) => {
    setViewingProjectId(projectId);
  };

  const handleSubmit = async (data: any) => {
    if (editingProject) {
      await updateProject.mutateAsync({ id: editingProject.id, data });
    } else {
      await createProject.mutateAsync(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this project?")) {
      deleteProject.mutate(id);
    }
  };

  const columns = [
    {
      key: "name",
      label: "Project",
      render: (value: string, row: Project) => (
        <div>
          <p className="font-medium">{value}</p>
          <p className="text-xs text-muted-foreground">{row.code || "No code"}</p>
        </div>
      ),
    },
    { key: "description", label: "Description", render: (value: string) => value || "N/A" },
    {
      key: "is_active",
      label: "Status",
      render: (value: boolean) => (
        <Badge variant={value ? "default" : "secondary"} className={value ? "bg-success" : ""}>
          {value ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "start_date",
      label: "Start Date",
      render: (value: string | null) => (value ? new Date(value).toLocaleDateString() : "N/A"),
    },
  ];

  const actions = (project: Project) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleView(project.id)}>
          <Eye className="h-4 w-4 mr-2" /> View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleEdit(project)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(project.id)}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <MainLayout title="Projects" description="Manage organizational projects">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Projects" description="Manage organizational projects">
      <PageHeader
        title="Projects"
        description="View and manage projects with associated assets"
        action={{ label: "Add Project", onClick: handleAddProject }}
        extra={<ViewModeToggle mode={viewMode} onModeChange={setViewMode} />}
      />

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={filteredProjects}
          searchable={false}
          useGlobalPageSearch={false}
          actions={actions}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <Card key={project.id} className="group hover:shadow-md transition-all animate-fade-in">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-12 w-12 rounded-lg bg-info/10 flex items-center justify-center">
                      <FolderKanban className="h-6 w-6 text-info" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={project.is_active ? "default" : "secondary"} className={project.is_active ? "bg-success" : ""}>
                        {project.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleView(project.id)}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(project)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(project.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <Badge variant="outline" className="font-mono text-xs mb-2">{project.code}</Badge>
                  <h3 className="font-semibold text-lg mb-1">{project.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{project.description}</p>

                  <div className="flex items-center gap-2 pt-4 border-t text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Started {project.start_date ? new Date(project.start_date).toLocaleDateString() : "N/A"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredProjects.length === 0 && (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No projects found.
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ProjectFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        project={editingProject}
        onSubmit={handleSubmit}
      />

      <Dialog open={Boolean(viewingProjectId)} onOpenChange={(open) => (!open ? setViewingProjectId(null) : null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{viewingProject?.name || "Project details"}</DialogTitle>
            <DialogDescription>
              Review the project record, timeline, and operational status.
            </DialogDescription>
          </DialogHeader>
          {isViewingProject ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isViewingProjectError || !viewingProject ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Unable to load project details.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {viewingProject.code ? (
                  <Badge variant="outline" className="font-mono text-xs">
                    {viewingProject.code}
                  </Badge>
                ) : null}
                <Badge
                  variant={viewingProject.is_active ? "default" : "secondary"}
                  className={viewingProject.is_active ? "bg-success" : ""}
                >
                  {viewingProject.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Start Date</p>
                  <p className="mt-1 text-sm font-medium">
                    {viewingProject.start_date
                      ? new Date(viewingProject.start_date).toLocaleDateString()
                      : "Not set"}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">End Date</p>
                  <p className="mt-1 text-sm font-medium">
                    {viewingProject.end_date
                      ? new Date(viewingProject.end_date).toLocaleDateString()
                      : "Not set"}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Budget</p>
                  <p className="mt-1 text-sm font-medium">
                    {typeof viewingProject.budget === "number"
                      ? `PKR ${viewingProject.budget.toLocaleString("en-PK")}`
                      : "Not recorded"}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
                  <p className="mt-1 text-sm font-medium">
                    {new Date(viewingProject.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="mt-1 text-sm leading-6 text-foreground">
                  {viewingProject.description || "No description provided."}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setViewingProjectId(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setViewingProjectId(null);
                    handleEdit(viewingProject);
                  }}
                >
                  Edit Project
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
