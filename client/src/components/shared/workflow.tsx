import type { LucideIcon } from "lucide-react";
import { ArrowRight, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ActionConfig = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
};

export interface MetricCardProps {
  label: string;
  value: string | number;
  helper?: string;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  trend?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
  trend,
}: MetricCardProps) {
  const accentColor: Record<NonNullable<MetricCardProps["tone"]>, string> = {
    default:  "bg-muted/60 text-muted-foreground",
    primary:  "bg-[#256d01]/10 text-[#256d01]",
    success:  "bg-success/10 text-success",
    warning:  "bg-warning/10 text-warning",
    danger:   "bg-destructive/10 text-destructive",
  };

  const accentStrip: Record<NonNullable<MetricCardProps["tone"]>, string> = {
    default: "bg-border/60",
    primary: "bg-[#256d01]",
    success: "bg-success",
    warning: "bg-warning",
    danger:  "bg-destructive",
  };

  return (
    <div
      className={cn(
        "workflow-metric-card relative h-full overflow-hidden rounded-2xl bg-white",
        "border border-[rgba(26,28,24,0.09)]",
        "shadow-[0_4px_32px_rgba(26,28,24,0.05)]",
        "flex flex-col min-h-[9.4rem]"
      )}
    >
      {/* tone accent strip */}
      <div className={cn("h-[3px] w-full flex-shrink-0", accentStrip[tone])} />

      <div className="relative flex flex-1 flex-col p-6 pt-5">
        {/* label + icon row */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10.5px] font-semibold uppercase leading-[1.2] tracking-[0.2em] text-muted-foreground/75">
            {label}
          </p>
          {Icon && (
            <div
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
                accentColor[tone]
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* value + helper */}
        <div className="mt-4 flex flex-1 flex-col justify-end space-y-1.5">
          <p
            className="font-['Manrope',sans-serif] text-[2.5rem] font-bold leading-none tracking-[-0.03em] text-foreground"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {helper && (
            <p className="text-[0.8125rem] leading-5 text-muted-foreground/80">
              {helper}
            </p>
          )}
          {trend && (
            <div className="pt-1 text-[0.8125rem] font-medium leading-5 text-muted-foreground">
              {trend}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkflowPanel({
  title,
  description,
  children,
  action,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("workflow-panel", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/70 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold tracking-tight">{title}</CardTitle>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn("pt-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("workflow-filter-bar", className)}>{children}</div>;
}

export function FilterField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatePanel({
  title,
  description,
  icon: Icon = Clock3,
  action,
  variant = "default",
  className,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ActionConfig;
  variant?: "default" | "warning" | "danger" | "success";
  className?: string;
}) {
  const variantClasses = {
    default: "border-border/80 bg-card",
    warning: "border-warning/30 bg-warning/[0.08]",
    danger: "border-destructive/25 bg-destructive/[0.07]",
    success: "border-success/25 bg-success/[0.08]",
  };

  const iconClasses = {
    default: "bg-foreground/5 text-foreground/70",
    warning: "bg-warning/16 text-warning",
    danger: "bg-destructive/12 text-destructive",
    success: "bg-success/12 text-success",
  };

  return (
    <div className={cn("rounded-3xl border p-6", variantClasses[variant], className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className={cn("mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", iconClasses[variant])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {action && (
          <Button variant={action.variant || "outline"} onClick={action.onClick} className="shrink-0">
            {action.icon}
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  badge?: string;
  icon?: LucideIcon;
}

export function TimelineList({
  items,
  emptyTitle = "Nothing to show",
  emptyDescription = "This section will populate when activity is available.",
}: {
  items: TimelineItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return <StatePanel title={emptyTitle} description={emptyDescription} className="p-5" />;
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const Icon = item.icon || Clock3;
        return (
          <div key={item.id} className="relative flex gap-4">
            {index < items.length - 1 && <div className="absolute left-[1.15rem] top-10 h-[calc(100%-1rem)] w-px bg-border/80" />}
            <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 rounded-2xl border border-border/70 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{item.title}</p>
                {item.badge && <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[11px]">{item.badge}</Badge>}
              </div>
              {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
              {item.meta && <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{item.meta}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InlineAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="ghost" size="sm" className="gap-1 text-sm" onClick={onClick}>
      {label}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
