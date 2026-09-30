import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, ChevronDown, Save, User, Zap } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/types";
import {
  updatePurchase,
  createEditLog,
  fetchProducts,
  fetchCustomerByPhone,
  createCustomer,
} from "@/lib/data";
import type { Purchase, Product, ProductVariant, PurchaseItem } from "@/lib/types";

// ─── Row type (mirrors add-purchase form) ────────────────────────────────────
type Row = {
  product_id?: string;
  product_name: string;
  variant_id?: string;
  variant_label?: string;
  price: string;
  qty: string;
  variants: ProductVariant[];
  variantLocked: boolean;
};

function emptyRow(): Row {
  return { product_name: "", price: "", qty: "1", variants: [], variantLocked: false };
}

function itemToRow(item: PurchaseItem, products: Product[]): Row {
  const prod     = products.find((p) => p.id === item.product_id);
  const variants = prod ? (prod.product_variants ?? []).filter((v) => v.is_active) : [];
  const foundVar = variants.find((v) => v.id === item.variant_id);
  return {
    product_id:   item.product_id   ?? undefined,
    product_name: item.product_name,
    variant_id:   item.variant_id   ?? undefined,
    variant_label: item.variant_label ?? undefined,
    price:        String(item.unit_price),
    qty:          String(item.quantity),
    variants,
    variantLocked: !!foundVar,
  };
}

const PAYMENT_METHODS = ["Cash", "UPI 1", "UPI 2", "UPI 3", "Card", "Bank Transfer"] as const;

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  purchase: Purchase;
  open: boolean;
  onClose: () => void;
  /** Called after a successful save; parent should re-fetch purchases */
  onSaved: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function EditPurchaseModal({ purchase, open, onClose, onSaved }: Props) {
  const [products,        setProducts]        = useState<Product[]>([]);
  const [rows,            setRows]            = useState<Row[]>([emptyRow()]);
  const [name,            setName]            = useState("");
  const [phone,           setPhone]           = useState("");
  const [isQuickBill,     setIsQuickBill]     = useState(false);
  const [paymentMethod,   setPaymentMethod]   = useState("Cash");
  const [upiAccount,      setUpiAccount]      = useState("upi_1");
  const [notes,           setNotes]           = useState("");
  const [overallDiscount, setOverallDiscount] = useState("");
  const [mixedAmounts,    setMixedAmounts]    = useState<Record<string, string>>(
    () => Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ""]))
  );
  const [saving, setSaving] = useState(false);

  const isMixed        = paymentMethod === "Mixed";
  const mixedTotal     = PAYMENT_METHODS.reduce((s, m) => s + (Number(mixedAmounts[m]) || 0), 0);
  const rowSub         = (r: Row) => (Number(r.qty) || 0) * (Number(r.price) || 0);
  const invoiceSub     = rows.reduce((s, r) => s + rowSub(r), 0);
  const discountVal    = Math.max(0, Number(overallDiscount) || 0);
  const discountError  = discountVal > invoiceSub && invoiceSub > 0 ? "Discount cannot exceed subtotal." : null;
  const grand          = Math.max(0, invoiceSub - Math.min(discountVal, invoiceSub));

  // ── Pre-populate form when modal opens ──────────────────────────────────
  useEffect(() => {
    if (!open) return;
    fetchProducts()
      .then((prods) => {
        setProducts(prods);
        setIsQuickBill(!purchase.customer_id);
        setName(purchase.customers?.customer_name ?? "");
        setPhone(purchase.customers?.phone_number ?? "");
        setPaymentMethod(purchase.payment_method ?? "Cash");
        setUpiAccount(purchase.upi_account ?? "upi_1");
        setNotes(purchase.notes ?? "");
        setOverallDiscount(purchase.overall_discount ? String(purchase.overall_discount) : "");

        const existingRows = (purchase.purchase_items ?? []).map((i) => itemToRow(i, prods));
        setRows(existingRows.length > 0 ? existingRows : [emptyRow()]);

        if (purchase.payment_method === "Mixed" && purchase.purchase_payments) {
          const amounts: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ""]));
          purchase.purchase_payments.forEach((pp) => {
            const key = pp.payment_method === "UPI" ? "UPI 3" : pp.payment_method;
            if (key in amounts) amounts[key] = String(pp.amount);
          });
          setMixedAmounts(amounts);
        } else {
          setMixedAmounts(Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ""])));
        }
      })
      .catch(console.error);
  }, [open, purchase]);

  // ── Row helpers ─────────────────────────────────────────────────────────
  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const selectProduct = (i: number, productName: string) => {
    const p = products.find((x) => x.product_name === productName);
    if (!p) {
      updateRow(i, { product_name: productName, product_id: undefined, variants: [], variant_id: undefined, variant_label: undefined, price: "", variantLocked: false });
      return;
    }
    const variants = (p.product_variants ?? []).filter((v) => v.is_active).sort((a, b) => a.selling_price - b.selling_price);
    if (variants.length === 1) {
      updateRow(i, { product_name: p.product_name, product_id: p.id, variants, variant_id: variants[0].id, variant_label: variants[0].ml, price: String(variants[0].selling_price), variantLocked: false });
    } else {
      updateRow(i, { product_name: p.product_name, product_id: p.id, variants, variant_id: undefined, variant_label: undefined, price: "", variantLocked: false });
    }
  };

  const selectVariant = (i: number, variantId: string) => {
    const v = rows[i].variants.find((x) => x.id === variantId);
    if (!v) return;
    updateRow(i, { variant_id: v.id, variant_label: v.ml, price: String(v.selling_price), variantLocked: true });
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const items = rows.filter((r) => r.product_name.trim() && Number(r.qty) > 0);
    if (!isQuickBill && !name.trim())                                 { toast.error("Customer name is required."); return; }
    if (!isQuickBill && (!phone.trim() || phone.trim().length < 10))  { toast.error("Valid phone number required (10+ digits)."); return; }
    if (items.length === 0)                                           { toast.error("Add at least one product."); return; }
    const missingVariant = items.find((r) => r.variants.length > 0 && !r.variant_id);
    if (missingVariant) { toast.error(`Please select a variant for "${missingVariant.product_name}"`); return; }
    if (discountError)  { toast.error(discountError); return; }
    if (invoiceSub <= 0){ toast.error("Total must be greater than 0."); return; }
    if (isMixed && Math.abs(mixedTotal - grand) > 0.01) { toast.error("Mixed payment amounts must equal the grand total."); return; }

    setSaving(true);
    try {
      // Resolve customer
      let customerId = purchase.customer_id;
      if (!isQuickBill) {
        let customer = await fetchCustomerByPhone(phone.trim());
        if (!customer) customer = await createCustomer({ customer_name: name.trim(), phone_number: phone.trim(), email: null, address: null, notes: null });
        customerId = customer!.id;
      } else {
        customerId = null;
      }

      const payAllocations = isMixed
        ? PAYMENT_METHODS.filter((m) => (Number(mixedAmounts[m]) || 0) > 0)
            .map((m) => ({ payment_method: m, amount: Number(mixedAmounts[m]) }))
        : undefined;

      const finalDiscount = Math.min(discountVal, invoiceSub);

      await updatePurchase(purchase.id, {
        customer_id:      customerId,
        total_amount:     grand,
        overall_discount: finalDiscount,
        payment_method:   paymentMethod,
        notes:            notes || null,
        upi_account:      paymentMethod === "UPI" ? upiAccount : null,
        items: items.map((r) => ({
          product_id:    r.product_id,
          product_name:  r.product_name,
          variant_id:    r.variant_id,
          variant_label: r.variant_label,
          quantity:      Number(r.qty) || 0,
          unit_price:    Number(r.price) || 0,
          discount:      0,
          total:         rowSub(r),
        })),
        payment_allocations: payAllocations,
      });

      // Audit log
      const summary = `Items: ${items.length}, Total: ${formatINR(grand)}, Discount: ${formatINR(finalDiscount)}, Payment: ${paymentMethod}`;
      await createEditLog(purchase.id, summary);

      toast.success(`Purchase ${purchase.invoice_number} updated successfully.`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update purchase.");
    }
    setSaving(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden rounded-2xl sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b pb-4">
          <DialogTitle className="text-lg">
            Edit Purchase — <span className="text-muted-foreground font-normal">{purchase.invoice_number}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Changes are saved to this purchase record and logged in the audit trail.</p>
        </DialogHeader>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-1 py-2">
          <div className="space-y-5">

            {/* ── Customer Info ── */}
            <section className="rounded-2xl border bg-card p-5">
              <h4 className="font-display text-sm font-semibold mb-4">Customer Information</h4>

              {/* Billing mode toggle */}
              <div className="mb-4 flex gap-3">
                <button type="button"
                  onClick={() => setIsQuickBill(false)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all ${!isQuickBill ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                  <User className="h-4 w-4" /> Customer Bill
                </button>
                <button type="button"
                  onClick={() => { setIsQuickBill(true); setName(""); setPhone(""); }}
                  className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all ${isQuickBill ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                  <Zap className="h-4 w-4" /> Quick Bill
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {!isQuickBill && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Phone Number</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Customer Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-11 rounded-xl" />
                    </div>
                  </>
                )}
                {isQuickBill && (
                  <div className="sm:col-span-2 rounded-xl border border-dashed border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-[var(--color-primary)]" />
                      <span className="font-medium">Quick Bill — no customer record</span>
                    </div>
                  </div>
                )}

                {/* Payment method */}
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <select value={paymentMethod}
                    onChange={(e) => { setPaymentMethod(e.target.value); if (e.target.value !== "Mixed") setMixedAmounts(Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ""]))); if (e.target.value !== "UPI") setUpiAccount("upi_1"); }}
                    className="h-11 w-full rounded-xl border bg-card px-3 text-sm">
                    <option>Cash</option><option>UPI</option><option>Card</option>
                    <option>Bank Transfer</option><option>Other</option><option>Mixed</option>
                  </select>
                </div>

                {paymentMethod === "UPI" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">UPI Account</Label>
                    <div className="flex gap-3 mt-1">
                      {(["upi_1", "upi_2", "upi_3"] as const).map((val, idx) => (
                        <label key={val} className={`flex items-center gap-2 cursor-pointer rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all ${upiAccount === val ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                          <input type="radio" name="edit_upi_account" value={val} checked={upiAccount === val} onChange={() => setUpiAccount(val)} className="sr-only" />
                          UPI {idx + 1}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="h-11 rounded-xl" />
                </div>
              </div>

              {/* Mixed payment allocation */}
              {isMixed && (
                <div className="mt-4 rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payment Allocation</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PAYMENT_METHODS.map((method) => (
                      <div key={method} className="flex items-center gap-2">
                        <Label className="w-28 shrink-0 text-sm">{method}</Label>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                          <Input type="number" min="0" step="1" placeholder="0"
                            value={mixedAmounts[method]}
                            onChange={(e) => setMixedAmounts((prev) => ({ ...prev, [method]: e.target.value }))}
                            className="h-10 rounded-lg pl-7 text-sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                  {grand > 0 && (() => {
                    const diff = grand - mixedTotal;
                    const ok   = Math.abs(diff) < 0.01;
                    return (
                      <div className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${ok ? "bg-green-50 text-green-700 border border-green-200" : diff > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                        <span>{ok ? "✓ Balanced" : diff > 0 ? "Remaining" : "Overpaid by"}</span>
                        <span>{ok ? formatINR(grand) : formatINR(Math.abs(diff))}</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* ── Products ── */}
            <section className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-display text-sm font-semibold">Products</h4>
                  <p className="text-xs text-muted-foreground">Edit items, quantities, and prices.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-xl"
                  onClick={() => setRows((rs) => [...rs, emptyRow()])}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Product
                </Button>
              </div>

              <div className="space-y-3">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-xl border bg-muted/30 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Product */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Product</Label>
                        <Input list={`edit-products-${i}`} value={r.product_name}
                          onChange={(e) => { updateRow(i, { product_name: e.target.value }); selectProduct(i, e.target.value); }}
                          placeholder="Type product name" className="h-10 rounded-lg" />
                        <datalist id={`edit-products-${i}`}>
                          {products.map((p) => <option key={p.id} value={p.product_name} />)}
                        </datalist>
                      </div>
                      {/* Variant */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Variant (ML)</Label>
                        {r.variants.length === 0 ? (
                          <div className="flex h-10 items-center rounded-lg border bg-muted/40 px-3 text-xs text-muted-foreground">
                            {r.product_name ? "No variants" : "Select a product first"}
                          </div>
                        ) : (
                          <div className="relative">
                            <select value={r.variant_id ?? ""} onChange={(e) => selectVariant(i, e.target.value)}
                              className="h-10 w-full appearance-none rounded-lg border bg-card px-3 pr-8 text-sm">
                              <option value="">— Select variant —</option>
                              {r.variants.map((v) => <option key={v.id} value={v.id}>{v.ml} — {formatINR(v.selling_price)}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Qty + Price + Subtotal + Delete */}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[70px_120px_1fr_auto]">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Qty</Label>
                        <input type="number" inputMode="numeric" min={1} step={1} value={r.qty} placeholder="Qty"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => { const v = e.target.value; if (v === "" || /^\d+$/.test(v)) updateRow(i, { qty: v }); }}
                          className="flex h-10 w-full rounded-lg border bg-card px-3 text-sm tabular-nums outline-none ring-ring focus-visible:ring-2" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          Unit Price {r.variantLocked && <span className="ml-1 text-[9px] text-green-600">(auto)</span>}
                        </Label>
                        <input type="number" inputMode="decimal" min={0} step="any" value={r.price} placeholder="₹ 0"
                          readOnly={r.variantLocked} onFocus={(e) => e.target.select()}
                          onChange={(e) => { if (!r.variantLocked) { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) updateRow(i, { price: v }); } }}
                          className={`flex h-10 w-full rounded-lg border px-3 text-sm tabular-nums outline-none ring-ring focus-visible:ring-2 ${r.variantLocked ? "bg-muted/50 text-muted-foreground cursor-default" : "bg-card"}`} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Subtotal</Label>
                        <div className="flex h-10 items-center justify-end rounded-lg border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                          {formatINR(rowSub(r))}
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="ghost" size="icon" disabled={rows.length === 1}
                          className="h-10 w-10 rounded-lg text-muted-foreground hover:text-destructive"
                          onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Billing summary */}
              <div className="mt-5 overflow-hidden rounded-xl border bg-muted/20">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
                  <span className="text-sm font-semibold tabular-nums">{formatINR(invoiceSub)}</span>
                </div>
                <div className="flex items-center justify-between border-b px-4 py-3 gap-4">
                  <span className="text-sm font-medium text-muted-foreground shrink-0">Overall Discount (₹)</span>
                  <div className="flex flex-col items-end gap-1">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                      <input type="number" inputMode="decimal" min={0} step="any"
                        value={overallDiscount} placeholder="0" onFocus={(e) => e.target.select()}
                        onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setOverallDiscount(v); }}
                        className={`h-10 w-36 rounded-lg border pl-7 pr-3 text-sm tabular-nums outline-none ring-ring focus-visible:ring-2 bg-card ${discountError ? "border-red-400 text-red-600" : ""}`} />
                    </div>
                    {discountError && <p className="text-[11px] text-red-500 font-medium">{discountError}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-4 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                  <span className="text-sm font-medium opacity-90">Grand Total</span>
                  <span className="font-display text-2xl font-bold tabular-nums">{formatINR(grand)}</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t pt-4 flex gap-3 justify-end">
          <Button variant="outline" className="h-11 rounded-xl px-6" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="h-11 rounded-xl px-6 text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
            onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
