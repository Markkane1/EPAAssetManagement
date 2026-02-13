import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, ArrowRight, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useVendors } from "@/hooks/useVendors";
import { format } from "date-fns";

type PurchaseOrderStatus = "Draft" | "Pending" | "Approved" | "Received" | "Cancelled";

export function PendingPurchaseOrders() {
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: vendors } = useVendors();

  const poList = purchaseOrders || [];
  const vendorList = vendors || [];

  // Filter for pending and approved orders (not yet received)
  const pendingOrders = poList
    .filter(po => 
      po.status === "Pending" || 
      po.status === "Approved"
    )
    .slice(0, 5);

  const getVendorName = (vendorId: string | null) => {
    if (!vendorId) return "Unknown Vendor";
    const vendor = vendorList.find(v => v.id === vendorId);
    return vendor?.name || "Unknown Vendor";
  };

  const getStatusColor = (status: PurchaseOrderStatus | null) => {
    switch (status) {
      case "Pending":
        return "bg-warning/10 text-warning border-warning/20";
      case "Approved":
        return "bg-info/10 text-info border-info/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          Pending Orders
        </CardTitle>
        <Link to="/purchase-orders">
          <Button variant="ghost" size="sm" className="gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {pendingOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No pending purchase orders
          </p>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {getVendorName(order.vendor_id)}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${getStatusColor(order.status)}`}
                  >
                    {order.status}
                  </Badge>
                  <p className="text-xs font-medium">
                    PKR {order.total_amount.toLocaleString("en-PK")}
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
