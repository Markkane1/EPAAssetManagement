import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
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

export function AssetStatusChart() {
  const { data: assetStatusData = [] } = useAssetsByStatus();
  const statusData = assetStatusData.map((entry) => ({
    name: entry.status,
    value: entry.count,
    color: statusColorMap[entry.status] || statusColorMap.Unknown,
  }));

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Asset Status Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {statusData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            No status data available
          </div>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  formatter={(value) => (
                    <span style={{ color: "hsl(var(--foreground))", fontSize: "12px" }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
