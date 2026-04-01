import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import {
  FilterBar,
  MetricCard,
  type MetricCardProps,
  WorkflowPanel,
} from "@/components/shared/workflow";

type ActionConfig = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
};

interface CollectionWorkspaceProps {
  title: string;
  description: string;
  eyebrow?: string;
  meta?: ReactNode;
  action?: ActionConfig;
  extra?: ReactNode;
  metrics?: MetricCardProps[];
  filterBar?: ReactNode;
  panelTitle: string;
  panelDescription: string;
  children: ReactNode;
  secondaryPanel?: {
    title: string;
    description: string;
    content: ReactNode;
  };
}

export function CollectionWorkspace({
  title,
  description,
  eyebrow,
  meta,
  action,
  extra,
  metrics,
  filterBar,
  panelTitle,
  panelDescription,
  children,
  secondaryPanel,
}: CollectionWorkspaceProps) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        eyebrow={eyebrow}
        meta={meta}
        action={action}
        extra={extra}
      />

      {metrics && metrics.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      ) : null}

      {filterBar ? <FilterBar>{filterBar}</FilterBar> : null}

      <div className={secondaryPanel ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" : ""}>
        <WorkflowPanel title={panelTitle} description={panelDescription}>
          {children}
        </WorkflowPanel>

        {secondaryPanel ? (
          <WorkflowPanel title={secondaryPanel.title} description={secondaryPanel.description}>
            {secondaryPanel.content}
          </WorkflowPanel>
        ) : null}
      </div>
    </>
  );
}
