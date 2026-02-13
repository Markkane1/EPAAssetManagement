import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { Project, Scheme } from "@/types";

const schemeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  projectId: z.string().min(1, "Project is required"),
  description: z.string().max(500).optional(),
});

type SchemeFormData = z.infer<typeof schemeSchema>;

interface SchemeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheme?: Scheme | null;
  projects: Project[];
  onSubmit: (data: SchemeFormData) => Promise<void>;
}

export function SchemeFormModal({ open, onOpenChange, scheme, projects, onSubmit }: SchemeFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!scheme;

  const form = useForm<SchemeFormData>({
    resolver: zodResolver(schemeSchema),
    defaultValues: {
      name: scheme?.name || "",
      projectId: scheme?.project_id || "",
      description: scheme?.description || "",
    },
  });

  useEffect(() => {
    if (scheme) {
      form.reset({
        name: scheme.name,
        projectId: scheme.project_id,
        description: scheme.description || "",
      });
    } else {
      form.reset({
        name: "",
        projectId: "",
        description: "",
      });
    }
  }, [scheme, form]);

  const handleSubmit = async (data: SchemeFormData) => {
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
          <DialogTitle>{isEditing ? "Edit Scheme" : "Add Scheme"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update scheme details below." : "Create a new project scheme."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Project *</Label>
            <Select
              value={form.watch("projectId")}
              onValueChange={(value) => form.setValue("projectId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.projectId && (
              <p className="text-sm text-destructive">{form.formState.errors.projectId.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...form.register("name")} placeholder="Scheme name" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register("description")} placeholder="Scheme description..." rows={3} />
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
