import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useAssets } from "@/hooks/useAssets";

export function AssetsByCategory() {
  const { data: categories = [] } = useCategories({ assetType: "ASSET" });
  const { data: assets = [] } = useAssets();

  // Calculate asset count per category
  const categoryStats = categories.map(category => {
    const assetCount = assets.filter(a => a.category_id === category.id).length;
    return { ...category, assetCount };
  });

  const totalAssets = categoryStats.reduce((sum, cat) => sum + cat.assetCount, 0);
  
  const sortedCategories = [...categoryStats].sort(
    (a, b) => b.assetCount - a.assetCount
  );

  const colors = [
    "bg-primary",
    "bg-accent",
    "bg-info",
    "bg-success",
    "bg-warning",
    "bg-destructive",
  ];

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FolderTree className="h-5 w-5 text-muted-foreground" />
          Assets by Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedCategories.map((category, index) => {
            const percentage = totalAssets > 0 
              ? Math.round((category.assetCount / totalAssets) * 100) 
              : 0;
            
            return (
              <div key={category.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{category.name}</span>
                  <span className="text-muted-foreground">
                    {category.assetCount} ({percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${colors[index % colors.length]} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
