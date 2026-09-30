import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, Hash, Printer, FileText, MessageCircle, Pencil, Zap, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { AdminPasscodeModal } from "@/components/admin-passcode-modal";
import { EditPurchaseModal } from "@/components/edit-purchase-modal";
import { formatDate, formatINR } from "@/lib/types";
import { fetchQuickBills, fetchReceiptStats } from "@/lib/data";
import { printThermalReceipt, sendWhatsAppBill, downloadInvoicePDF } from "@/lib/receipt";
import type { Purchase } from "@/lib/types";

export function QuickBillsTab() {
  const [bills, setBills] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [receiptStats, setReceiptStats] = useState<Map<string, { printCount: number; whatsappCount: number; lastPrinted: string | null; lastWhatsapp: string | null }>>(new Map());
  // Edit flow
  const [passkodeTarget, setPasskodeTarget] = useState<Purchase | null>(null);
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null);

  const loadBills = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    try {
      const data = await fetchQuickBills({ search: searchTerm });
      setBills(data);
      if (data.length > 0) {
        const rs = await fetchReceiptStats(data.map((x) => x.id));
        setReceiptStats(rs);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadBills(search);
  };

  const handleEditClick = (p: Purchase) => setPasskodeTarget(p);
  const handlePasscodeVerified = () => {
    setEditPurchase(passkodeTarget);
    setPasskodeTarget(null);
  };
  const handleEditSaved = useCallback(async () => {
    await loadBills(search);
  }, [loadBills, search]);

  const filtered = bills;

  return (
    <>
      {/* Search bar */}
      <div className="no-print">
        <form onSubmit={handleSearch} className="mx-auto max-w-2xl flex gap-2 rounded-2xl border bg-card p-2 shadow-xl">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice number, date, or product..."
              className="h-12 rounded-xl border-0 bg-muted/40 pl-11 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:bg-muted/60"
            />
          </div>
          <Button type="submit" disabled={loading} className="h-12 rounded-xl px-6 font-semibold" style={{ background: "var(--gradient-primary)" }}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Search
          </Button>
        </form>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <EmptyState
          title="No Quick Bills found"
          description={search ? `No results for "${search}". Try a different search.` : "Quick Bills will appear here after they are created."}
        />
      )}

      {!loading && filtered.length > 0 && (
        <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-[var(--color-primary)]" /> Quick Bills
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{filtered.length} records</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Invoice</th>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Products</th>
                  <th className="px-5 py-3 text-right font-medium">Grand Total</th>
                  <th className="px-5 py-3 text-left font-medium">Payment</th>
                  <th className="px-5 py-3 text-center font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => {
                  const rs = receiptStats.get(p.id);
                  const items = p.purchase_items ?? [];
                  const productList = items.map((i) =>
                    i.variant_label ? `${i.product_name} (${i.variant_label}) ×${i.quantity}` : `${i.product_name} ×${i.quantity}`
                  ).join(", ");
                  const paymentDisplay = p.payment_method === "UPI" && p.upi_account
                    ? `UPI (${p.upi_account === "upi_1" ? "UPI 1" : p.upi_account === "upi_2" ? "UPI 2" : "UPI 3"})`
                    : p.payment_method ?? "Cash";

                  return (
                    <tr key={p.id} className="transition-colors hover:bg-muted/30">
                      {/* Invoice */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                            <Hash className="h-3 w-3" />{p.invoice_number}
                          </span>
                          {p.is_edited && (
                            <span title={p.edited_at ? `Edited on ${new Date(p.edited_at).toLocaleString("en-IN")}` : "Edited"}
                              className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 cursor-help">
                              ✏ Edited
                            </span>
                          )}
                          {rs && rs.printCount > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">🖨 {rs.printCount}×</span>}
                          {rs && rs.whatsappCount > 0 && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">💬 {rs.whatsappCount}×</span>}
                        </div>
                      </td>
                      {/* Date */}
                      <td className="px-5 py-3.5 text-muted-foreground">{formatDate(p.purchase_date)}</td>
                      {/* Products */}
                      <td className="px-5 py-3.5 max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate text-xs" title={productList}>{productList || "—"}</span>
                        </div>
                      </td>
                      {/* Total */}
                      <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatINR(p.total_amount)}</td>
                      {/* Payment */}
                      <td className="px-5 py-3.5">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">{paymentDisplay}</span>
                      </td>
                      {/* Status */}
                      <td className="px-5 py-3.5 text-center">
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-medium text-green-700">Completed</span>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] px-2" onClick={() => printThermalReceipt(p)}>
                            <Printer className="mr-1 h-3 w-3" /> Print
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] px-2" onClick={() => downloadInvoicePDF(p)}>
                            <FileText className="mr-1 h-3 w-3" /> PDF
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] px-2 text-green-700 hover:bg-green-50" onClick={() => sendWhatsAppBill(p)}>
                            <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] px-2 text-violet-700 hover:bg-violet-50" onClick={() => handleEditClick(p)}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Admin passcode gate */}
      <AdminPasscodeModal
        open={!!passkodeTarget}
        onCancel={() => setPasskodeTarget(null)}
        onVerified={handlePasscodeVerified}
      />

      {/* Edit purchase form */}
      {editPurchase && (
        <EditPurchaseModal
          purchase={editPurchase}
          open={!!editPurchase}
          onClose={() => setEditPurchase(null)}
          onSaved={handleEditSaved}
        />
      )}
    </>
  );
}
