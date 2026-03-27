import { BarChart3 } from "lucide-react";
import { useAssetsByStatus } from "@/hooks/useDashboard";

const statusColorMap: Record<string, string> = {
  Available: "hsl(142, 76%, 36%)",
  Assigned: "hsl(199, 89%, 48%)",
  Maintenance: "hsl(38, 92%, 50%)",
  Damaged: "hsl(0, 84%, 60%)",
  Retired: "hsl(215, 16%, 47%)",
  Unknown: "hsl(215, 16%, 47%)",
};

type ArcSegment = {
  color: string;
  value: number;
  startAngle: number;
  endAngle: number;
};

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

export function AssetStatusChart() {
  const { data: assetStatusData = [] } = useAssetsByStatus();
  const total = assetStatusData.reduce((sum, entry) => sum + entry.count, 0);
  const segments = assetStatusData.reduce<ArcSegment[]>((acc, entry) => {
    if (entry.count <= 0 || total <= 0) return acc;

    const previousEndAngle = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
    const sweep = (entry.count / total) * 360;
    acc.push({
      color: statusColorMap[entry.status] || statusColorMap.Unknown,
      value: entry.count,
      startAngle: previousEndAngle,
      endAngle: previousEndAngle + sweep,
    });
    return acc;
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Asset Status Distribution</h3>
      </div>

      {segments.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
          No status data available
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="relative h-[220px] w-[220px]">
              <svg viewBox="0 0 220 220" className="h-full w-full">
                <circle
                  cx="110"
                  cy="110"
                  r="74"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="28"
                />
                {segments.map((segment, index) => (
                  <path
                    key={`${segment.color}-${index}`}
                    d={describeArc(110, 110, 74, segment.startAngle, segment.endAngle)}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="28"
                    strokeLinecap="butt"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-semibold">{total}</span>
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Total Items
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {assetStatusData.map((entry) => {
              const count = Number(entry.count || 0);
              const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
              const color = statusColorMap[entry.status] || statusColorMap.Unknown;

              return (
                <div key={entry.status} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium">{entry.status}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
