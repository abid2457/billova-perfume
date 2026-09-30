import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatINR } from "@/lib/types";
import type { Purchase } from "@/lib/types";

export function PurchaseDetailsModal({
  purchase, open, onOpenChange,
}: { purchase: Purchase | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Purchase Details</DialogTitle>
          <DialogDescription>Full breakdown of this transaction.</DialogDescription>
        </DialogHeader>
        {purchase && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display truncate text-base font-semibold">{purchase.customers?.customer_name ?? "Unknown"}</p>
                  <p className="text-sm text-muted-foreground">{purchase.customers?.phone_number ?? "—"}</p>
                </div>
                <Badge variant="secondary" className="shrink-0">{formatDate(purchase.purchase_date)}</Badge>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">Product</th>
                    <th className="p-3 text-right font-medium">Qty</th>
                    <th className="p-3 text-right font-medium">Price</th>
                    <th className="p-3 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(purchase.purchase_items ?? []).map((it, i) => (
                    <tr key={i}>
                      <td className="p-3">
                        {it.product_name}
                        {it.variant_label && <span className="ml-1 text-xs text-muted-foreground">({it.variant_label})</span>}
                      </td>
                      <td className="p-3 text-right">{it.quantity}</td>
                      <td className="p-3 text-right">{formatINR(it.unit_price)}</td>
                      <td className="p-3 text-right font-medium">{formatINR(it.quantity * it.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-2">
              {(() => {
                const subtotal = (purchase.purchase_items ?? []).reduce((s, it) => s + it.quantity * it.unit_price, 0);
                const disc = (purchase as any).overall_discount ?? 0;
                return (
                  <>
                    {disc > 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">{formatINR(subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-red-500">Overall Discount</span>
                          <span className="font-medium text-red-500">-{formatINR(disc)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between border-t pt-2">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Grand Total</span>
                        {purchase.payment_method && purchase.payment_method !== "Mixed" && (() => {
                          const displayMethod = purchase.payment_method === "UPI" && purchase.upi_account
                            ? `UPI (${purchase.upi_account === "upi_1" ? "UPI 1" : purchase.upi_account === "upi_2" ? "UPI 2" : "UPI 3"})`
                            : purchase.payment_method;
                          return <span className="ml-3 text-xs text-muted-foreground">({displayMethod})</span>;
                        })()}
                      </div>
                      <span className="font-display text-2xl font-bold">{formatINR(purchase.total_amount)}</span>
                    </div>
                  </>
                );
              })()}
              {/* Mixed payment breakdown */}
              {purchase.payment_method === "Mixed" && purchase.purchase_payments && purchase.purchase_payments.length > 0 && (
                <div className="mt-1 space-y-1.5 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Breakdown</p>
                  {purchase.purchase_payments.map((pp, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{pp.payment_method}</span>
                      <span className="font-medium">{formatINR(pp.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {purchase.notes && <p className="text-xs text-muted-foreground italic">Note: {purchase.notes}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}