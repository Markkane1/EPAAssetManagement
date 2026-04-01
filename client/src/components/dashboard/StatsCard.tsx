import { LucideIcon } from "lucide-react";
import { MetricCard } from "@/components/shared/workflow";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "primary" | "accent" | "success" | "warning" | "info";
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  trend,
}: StatsCardProps) {
  const toneMap = {
    default: "default",
    primary: "primary",
    accent: "primary",
    success: "success",
    warning: "warning",
    info: "primary",
  } as const;

  return (
    <MetricCard
      label={title}
      value={value}
      helper={subtitle}
      icon={Icon}
      tone={toneMap[variant]}
      trend={
        trend ? (
          <div className="flex items-center gap-1.5">
            <span className={trend.isPositive ? "text-success" : "text-destructive"}>
              {trend.isPositive ? "+" : ""}
              {trend.value}%
            </span>
            <span className="text-muted-foreground">vs last month</span>
          </div>
        ) : undefined
      }
    />
  );
}
