import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, ArrowRight, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useTransfers } from "@/hooks/useTransfers";
import { useLocations } from "@/hooks/useLocations";
import { useAssetItems } from "@/hooks/useAssetItems";
import { format } from "date-fns";

export function RecentTransfers() {
  const { data: transfers } = useTransfers();
  const { data: locations } = useLocations();
  const { data: assetItems } = useAssetItems();

  const recentTransfers = (transfers || []).slice(0, 5);

  const getLocationName = (locationId: string | null) => {
    if (!locationId) return "Unknown";
    const location = locations?.find(l => l.id === locationId);
    return location?.name || "Unknown";
  };

  const getAssetTag = (assetItemId: string) => {
    const item = assetItems?.find(i => i.id === assetItemId);
    return item?.tag || "N/A";
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
          Recent Transfers
        </CardTitle>
        <Link to="/transfers">
          <Button variant="ghost" size="sm" className="gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {recentTransfers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No transfers recorded yet
          </p>
        ) : (
          <div className="space-y-3">
            {recentTransfers.map((transfer) => (
              <div
                key={transfer.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      Asset: {getAssetTag(transfer.asset_item_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getLocationName(transfer.from_location_id)} → {getLocationName(transfer.to_location_id)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(transfer.transfer_date), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
