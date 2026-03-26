import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  };
  extra?: React.ReactNode;
}

export function PageHeader({ title, description, eyebrow, meta, action, extra }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="min-w-0 space-y-3">
        {eyebrow && (
          <Badge variant="outline" className="w-fit">
            {eyebrow}
          </Badge>
        )}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
        {meta && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[220px] sm:items-end">
        {extra}
        {action && (
          <Button onClick={action.onClick} variant={action.variant} className="w-full gap-2 sm:w-auto">
            {action.icon || <Plus className="h-4 w-4" />}
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
