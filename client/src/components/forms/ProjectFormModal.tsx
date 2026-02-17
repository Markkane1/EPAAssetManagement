import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Project } from "@/types";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  code: z.string().min(1, "Code is required").max(20),
  description: z.string().max(500).optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
}).superRefine((data, ctx) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  if (Number.isNaN(start.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startDate"],
      message: "Start date is invalid",
    });
    return;
  }
  if (Number.isNaN(end.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date is invalid",
    });
    return;
  }
  if (start >= end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be later than start date",
    });
  }
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSubmit: (data: ProjectFormData) => Promise<void>;
}

export function ProjectFormModal({ open, onOpenChange, project, onSubmit }: ProjectFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!project;
  const defaultEndDate = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }, []);

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || "",
      code: project?.code || "",
      description: project?.description || "",
      startDate: project?.start_date ? new Date(project.start_date).toISOString().split('T')[0] : "",
      endDate: project?.end_date ? new Date(project.end_date).toISOString().split('T')[0] : "",
    },
  });

  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name,
        code: project.code || "",
        description: project.description || "",
        startDate: project.start_date ? new Date(project.start_date).toISOString().split('T')[0] : "",
        endDate: project.end_date ? new Date(project.end_date).toISOString().split('T')[0] : "",
      });
    } else {
      form.reset({
        name: "",
        code: "",
        description: "",
        startDate: new Date().toISOString().split('T')[0],
        endDate: defaultEndDate,
      });
    }
  }, [project, form, defaultEndDate]);

  const handleSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Project" : "Add Project"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update project details below." : "Create a new project."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" {...form.register("name")} placeholder="Project name" />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Code *</Label>
              <Input id="code" {...form.register("code")} placeholder="PRJ-001" />
              {form.formState.errors.code && (
                <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} placeholder="Project description..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input id="startDate" type="date" {...form.register("startDate")} />
              {form.formState.errors.startDate && (
                <p className="text-sm text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input id="endDate" type="date" {...form.register("endDate")} />
              {form.formState.errors.endDate && (
                <p className="text-sm text-destructive">{form.formState.errors.endDate.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
