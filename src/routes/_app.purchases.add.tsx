import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Save, Loader2, CheckCircle2, Printer, MessageCircle, FileText, ChevronDown, Zap, User } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/types";
import { createPurchase, fetchCustomerByPhone, createCustomer, fetchProducts } from "@/lib/data";
import { printThermalReceipt, sendWhatsAppBill, downloadInvoicePDF } from "@/lib/receipt";
import { supabase } from "@/lib/supabase";
import type { Product, ProductVariant, Customer, Purchase } from "@/lib/types";

export const Route = createFileRoute("/_app/purchases/add")({
  head: () => ({ meta: [{ title: "Add Purchase — Hira Perfumes" }] }),
  component: AddPurchase,
});

// ─── Row type — no per-row discount (overall invoice discount instead) ────────
type Row = {
  product_id?: string;
  product_name: string;
  variant_id?: string;
  variant_label?: string;   // the ml label e.g. "100 ml"
  price: string;
  qty: string;
  variants: ProductVariant[]; // available variants for this product
  variantLocked: boolean;     // true when a variant was auto-selected
};

function emptyRow(): Row {
  return { product_name: "", price: "", qty: "", variants: [], variantLocked: false };
}

function AddPurchase() {
  const navigate = useNavigate();
  const [billingMode, setBillingMode] = useState<"customer" | "quick">("customer");
  const [name, setName]               = useState("");
  const [phone, setPhone]             = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [upiAccount, setUpiAccount] = useState("upi_1");
  const isQuickBill = billingMode === "quick";
  const [notes, setNotes]             = useState("");
  const [rows, setRows]               = useState<Row[]>([emptyRow()]);
  const [overallDiscount, setOverallDiscount] = useState("");

  // ── Mixed payment state ──
  const PAYMENT_METHODS = ["Cash", "UPI 1", "UPI 2", "UPI 3", "Card", "Bank Transfer"] as const;
  const [mixedAmounts, setMixedAmounts] = useState<Record<string, string>>(
    () => Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ""]))
  );
  const isMixed = paymentMethod === "Mixed";
  const mixedTotal = PAYMENT_METHODS.reduce((s, m) => s + (Number(mixedAmounts[m]) || 0), 0);
  const [saving, setSaving]           = useState(false);
  const [products, setProducts]       = useState<Product[]>([]);
  const [customerFound, setCustomerFound] = useState<Customer | null>(null);
  const [savedPurchase, setSavedPurchase] = useState<Purchase | null>(null);

  // Phone suggestions
  const [phoneSuggestions, setPhoneSuggestions]     = useState<Customer[]>([]);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const phoneTimer  = useRef<ReturnType<typeof setTimeout>>();
  const phoneSugRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProducts().then(setProducts).catch(console.error);
    const handler = (e: MouseEvent) => {
      if (phoneSugRef.current && !phoneSugRef.current.contains(e.target as Node))
        setShowPhoneSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Phone live search ──
  const onPhoneInput = (val: string) => {
    setPhone(val);
    setCustomerFound(null);
    clearTimeout(phoneTimer.current);
    if (val.length >= 3) {
      phoneTimer.current = setTimeout(async () => {
        const { data } = await supabase.from("customers").select("*")
          .or(`phone_number.ilike.%${val}%,customer_name.ilike.%${val}%`).limit(5);
        setPhoneSuggestions(data ?? []);
        setShowPhoneSuggestions(true);
      }, 250);
    } else {
      setPhoneSuggestions([]);
      setShowPhoneSuggestions(false);
    }
  };

  const selectCustomer = (c: Customer) => {
    setPhone(c.phone_number);
    setName(c.customer_name);
    setCustomerFound(c);
    setShowPhoneSuggestions(false);
    toast.info(`Customer: ${c.customer_name}`);
  };

  // ── Row helpers ──
  const rowSubtotal = (r: Row) => (Number(r.qty) || 0) * (Number(r.price) || 0);
  const invoiceSubtotal = rows.reduce((s, r) => s + rowSubtotal(r), 0);
  const discountVal = Math.max(0, Number(overallDiscount) || 0);
  const discountError = discountVal > invoiceSubtotal && invoiceSubtotal > 0
    ? "Discount cannot exceed subtotal."
    : null;
  const grand = Math.max(0, invoiceSubtotal - Math.min(discountVal, invoiceSubtotal));

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // ── Select product → load its variants ──
  const selectProduct = (i: number, productName: string) => {
    const p = products.find((x) => x.product_name === productName);
    if (!p) {
      updateRow(i, { product_name: productName, product_id: undefined, variants: [], variant_id: undefined, variant_label: undefined, price: "", variantLocked: false });
      return;
    }
    const variants = (p.product_variants ?? []).filter((v) => v.is_active).sort((a, b) => a.selling_price - b.selling_price);

    if (variants.length === 1) {
      // Auto-select the single variant
      updateRow(i, {
        product_name: p.product_name,
        product_id: p.id,
        variants,
        variant_id: variants[0].id,
        variant_label: variants[0].ml,
        price: String(variants[0].selling_price),
        variantLocked: false,
      });
    } else {
      // Multiple variants — user must pick
      updateRow(i, {
        product_name: p.product_name,
        product_id: p.id,
        variants,
        variant_id: undefined,
        variant_label: undefined,
        price: "",
        variantLocked: false,
      });
    }
  };

  // ── Select variant ──
  const selectVariant = (i: number, variantId: string) => {
    const row = rows[i];
    const v   = row.variants.find((x) => x.id === variantId);
    if (!v) return;
    updateRow(i, {
      variant_id: v.id,
      variant_label: v.ml,
      price: String(v.selling_price),
      variantLocked: true,
    });
  };

  // ── Save ──
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = rows.filter((r) => r.product_name.trim() && Number(r.qty) > 0);
    if (!isQuickBill && !name.trim())                                    { toast.error("Customer name is required."); return; }
    if (!isQuickBill && (!phone.trim() || phone.trim().length < 10))     { toast.error("Valid phone number required (10+ digits)."); return; }
    if (items.length === 0)                              { toast.error("Add at least one product."); return; }

    // Check all selected products have a variant chosen
    const missingVariant = items.find((r) => r.variants.length > 0 && !r.variant_id);
    if (missingVariant) {
      toast.error(`Please select a variant for "${missingVariant.product_name}"`);
      return;
    }

    // Validate overall discount
    if (discountError) { toast.error(discountError); return; }

    if (grand <= 0 && invoiceSubtotal > 0 && discountVal >= invoiceSubtotal) {
      toast.error("Discount cannot equal or exceed subtotal."); return;
    }
    if (invoiceSubtotal <= 0) { toast.error("Total amount must be greater than 0."); return; }

    // Validate mixed payment total
    if (isMixed && Math.abs(mixedTotal - grand) > 0.01) {
      toast.error("Mixed payment amounts must equal the grand total.");
      return;
    }

    setSaving(true);
    try {
      // Quick Bill: no customer creation. Customer Bill: find or create customer.
      let customerId: string | null = null;
      let displayName = "Walk-in Customer";
      let displayPhone = "";

      if (!isQuickBill) {
        let customer = await fetchCustomerByPhone(phone.trim());
        if (!customer) {
          customer = await createCustomer({ customer_name: name.trim(), phone_number: phone.trim(), email: null, address: null, notes: null });
        }
        customerId = customer.id;
        displayName = name.trim();
        displayPhone = phone.trim();
      }

      const payAllocations = isMixed
        ? PAYMENT_METHODS.filter((m) => (Number(mixedAmounts[m]) || 0) > 0)
            .map((m) => ({ payment_method: m, amount: Number(mixedAmounts[m]) }))
        : undefined;

      const result = await createPurchase({
        customer_id: customerId,
        billing_mode: isQuickBill ? "quick" : "customer",
        purchase_date: new Date().toISOString(),
        total_amount: grand,
        overall_discount: Math.min(discountVal, invoiceSubtotal),
        payment_method: paymentMethod,
        notes: notes || undefined,
        upi_account: paymentMethod === "UPI" ? upiAccount : undefined,
        items: items.map((r) => ({
          product_id: r.product_id,
          product_name: r.product_name,
          variant_id: r.variant_id,
          variant_label: r.variant_label,
          quantity: Number(r.qty) || 0,
          unit_price: Number(r.price) || 0,
          discount: 0,
          total: rowSubtotal(r),
        })),
        payment_allocations: payAllocations,
      });

      const fullPurchase: Purchase = {
        ...result,
        overall_discount: Math.min(discountVal, invoiceSubtotal),
        customers: { customer_name: displayName, phone_number: displayPhone },
        purchase_items: items.map((r) => ({
          id: "",
          purchase_id: result.id,
          product_id: r.product_id ?? null,
          product_name: r.product_name,
          variant_id: r.variant_id ?? null,
          variant_label: r.variant_label ?? null,
          quantity: Number(r.qty) || 0,
          unit_price: Number(r.price) || 0,
          discount: 0,
          total: rowSubtotal(r),
        })),
        purchase_payments: payAllocations?.map((a) => ({
          id: "", purchase_id: result.id, created_at: "",
          payment_method: a.payment_method, amount: a.amount,
        })),
      };
      setSavedPurchase(fullPurchase);
      toast.success(`Purchase saved! Invoice: ${result.invoice_number}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save purchase");
    }
    setSaving(false);
  };

  return (
    <>
      <AppHeader title="Add Purchase" />
      <main className="flex-1 p-4 sm:p-6">
        {savedPurchase ? (
          /* ── Success Screen ── */
          <div className="mx-auto max-w-md space-y-6 py-12 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">Purchase Saved!</h2>
              <p className="mt-2 text-muted-foreground">Invoice number</p>
              <p className="font-display mt-1 text-3xl font-extrabold tracking-tight" style={{ color: "var(--color-primary)" }}>{savedPurchase.invoice_number}</p>
              <p className="mt-2 text-sm text-muted-foreground">{savedPurchase.customers?.customer_name ?? "Walk-in Customer"} · {formatINR(savedPurchase.total_amount)}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button className="h-11 rounded-xl px-6 text-primary-foreground" style={{ background: "var(--gradient-primary)" }} onClick={() => printThermalReceipt(savedPurchase)}>
                <Printer className="mr-2 h-4 w-4" /> Print Receipt
              </Button>
              <Button variant="outline" className="h-11 rounded-xl px-6" onClick={() => downloadInvoicePDF(savedPurchase)}>
                <FileText className="mr-2 h-4 w-4" /> Download PDF
              </Button>
              <Button variant="outline" className="h-11 rounded-xl px-6 text-green-700 hover:bg-green-50" disabled={!savedPurchase.customers?.phone_number} onClick={() => sendWhatsAppBill(savedPurchase)}>
                <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp Bill
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" className="h-10 rounded-xl px-5" onClick={() => { setSavedPurchase(null); setBillingMode("customer"); setName(""); setPhone(""); setNotes(""); setRows([emptyRow()]); setOverallDiscount(""); setCustomerFound(null); setPaymentMethod("Cash"); setUpiAccount("upi_1"); setMixedAmounts(Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ""]))); }}>
                <Plus className="mr-1.5 h-4 w-4" /> New Purchase
              </Button>
              <Button variant="ghost" className="h-10 rounded-xl px-5" onClick={() => navigate({ to: "/" })}>
                Go to Dashboard
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="mx-auto max-w-4xl space-y-6">
            {/* ── Customer Info ── */}
            <section className="rounded-2xl border bg-card p-5 sm:p-6" style={{ boxShadow: "var(--shadow-elegant)" }}>
              <h3 className="font-display text-base font-semibold">Customer Information</h3>
              <p className="text-xs text-muted-foreground">Who is making this purchase?</p>

              {/* ── Billing Mode Toggle ── */}
              <div className="mt-4 mb-4">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Billing Mode</Label>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setBillingMode("customer"); }}
                    className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                      billingMode === "customer"
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <User className="h-4 w-4" />
                    Customer Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBillingMode("quick"); setName(""); setPhone(""); setCustomerFound(null); setShowPhoneSuggestions(false); }}
                    className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                      billingMode === "quick"
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Zap className="h-4 w-4" />
                    Quick Bill
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {!isQuickBill && (
                  <div className="space-y-1.5" ref={phoneSugRef}>
                    <Label htmlFor="cphone">Phone Number</Label>
                    <div className="relative">
                      <Input id="cphone" value={phone} onChange={(e) => onPhoneInput(e.target.value)}
                        placeholder="10-digit mobile" className="h-11 rounded-xl" />
                      {customerFound && (
                        <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
                      )}
                    </div>
                    {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full max-w-[calc(50%-24px)] overflow-hidden rounded-xl border bg-card shadow-lg">
                        {phoneSuggestions.map((c) => (
                          <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                              {c.customer_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium">{c.customer_name}</p>
                              <p className="text-xs text-muted-foreground">{c.phone_number}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!isQuickBill && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cname">Customer Name</Label>
                    <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-11 rounded-xl" />
                  </div>
                )}
                {isQuickBill && (
                  <div className="sm:col-span-2 rounded-xl border border-dashed border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-[var(--color-primary)]" />
                      <span className="font-medium">Quick Bill mode</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">No customer record will be created. Bill will be saved as "Walk-in Customer".</p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); if (e.target.value !== "Mixed") setMixedAmounts(Object.fromEntries(PAYMENT_METHODS.map((m) => [m, ""]))); if (e.target.value !== "UPI") setUpiAccount("upi_1"); }} className="h-11 w-full rounded-xl border bg-card px-3 text-sm">
                    <option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option><option>Other</option>
                    <option>Mixed</option>
                  </select>
                </div>
                {paymentMethod === "UPI" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">UPI Account</Label>
                    <div className="flex gap-3 mt-1">
                      {(["upi_1", "upi_2", "upi_3"] as const).map((val, idx) => (
                        <label key={val} className={`flex items-center gap-2 cursor-pointer rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                          upiAccount === val
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}>
                          <input
                            type="radio" name="upi_account" value={val}
                            checked={upiAccount === val}
                            onChange={() => setUpiAccount(val)}
                            className="sr-only"
                          />
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                            upiAccount === val ? "border-[var(--color-primary)]" : "border-muted-foreground/40"
                          }`}>
                            {upiAccount === val && <div className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />}
                          </div>
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

              {/* ── Mixed Payment Allocation ── */}
              {isMixed && (
                <div className="mt-4 rounded-xl border p-4" style={{ background: "var(--color-muted)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payment Allocation</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PAYMENT_METHODS.map((method) => (
                      <div key={method} className="flex items-center gap-2">
                        <Label className="w-28 shrink-0 text-sm">{method}</Label>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                          <Input
                            type="number" min="0" step="1" placeholder="0"
                            value={mixedAmounts[method]}
                            onChange={(e) => setMixedAmounts((prev) => ({ ...prev, [method]: e.target.value }))}
                            className="h-10 rounded-lg pl-7 text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Live remaining / overpaid indicator */}
                  {grand > 0 && (() => {
                    const diff = grand - mixedTotal;
                    const isBalanced = Math.abs(diff) < 0.01;
                    return (
                      <div className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
                        isBalanced ? "bg-green-50 text-green-700 border border-green-200"
                        : diff > 0 ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                      }`}>
                        <span>{isBalanced ? "✓ Balanced" : diff > 0 ? `Remaining` : `Overpaid by`}</span>
                        <span>{isBalanced ? formatINR(grand) : diff > 0 ? formatINR(diff) : formatINR(Math.abs(diff))}</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* ── Products ── */}
            <section className="rounded-2xl border bg-card p-5 sm:p-6" style={{ boxShadow: "var(--shadow-elegant)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-semibold">Products</h3>
                  <p className="text-xs text-muted-foreground">Select product → choose variant → price auto-fills</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-xl"
                  onClick={() => setRows((rs) => [...rs, emptyRow()])}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Product
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-xl border bg-muted/30 p-3">
                    {/* Row 1: Product + Variant */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* Product search */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Product</Label>
                        <Input
                          list={`products-${i}`}
                          value={r.product_name}
                          onChange={(e) => { updateRow(i, { product_name: e.target.value }); selectProduct(i, e.target.value); }}
                          placeholder="Type product name"
                          className="h-10 rounded-lg"
                        />
                        <datalist id={`products-${i}`}>
                          {products.map((p) => <option key={p.id} value={p.product_name} />)}
                        </datalist>
                      </div>

                      {/* Variant selector */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          Variant (ML)
                        </Label>
                        {r.variants.length === 0 ? (
                          <div className="flex h-10 items-center rounded-lg border bg-muted/40 px-3 text-xs text-muted-foreground">
                            {r.product_name ? "No variants — add in Products page" : "Select a product first"}
                          </div>
                        ) : (
                          <div className="relative">
                            <select
                              value={r.variant_id ?? ""}
                              onChange={(e) => selectVariant(i, e.target.value)}
                              className="h-10 w-full appearance-none rounded-lg border bg-card px-3 pr-8 text-sm"
                            >
                              <option value="">— Select variant —</option>
                              {r.variants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.ml} — {formatINR(v.selling_price)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Qty + Price + Subtotal + Delete */}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[70px_120px_1fr_auto]">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Qty</Label>
                        <input
                          type="number" inputMode="numeric" min={1} step={1}
                          value={r.qty} placeholder="Qty"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => { const v = e.target.value; if (v === "" || /^\d+$/.test(v)) updateRow(i, { qty: v }); }}
                          className="flex h-10 w-full rounded-lg border bg-card px-3 text-sm tabular-nums outline-none ring-ring focus-visible:ring-2"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          Unit Price {r.variantLocked && <span className="ml-1 text-[9px] text-green-600">(auto)</span>}
                        </Label>
                        <input
                          type="number" inputMode="decimal" min={0} step="any"
                          value={r.price} placeholder="₹ 0"
                          readOnly={r.variantLocked}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => { if (!r.variantLocked) { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) updateRow(i, { price: v }); } }}
                          className={`flex h-10 w-full rounded-lg border px-3 text-sm tabular-nums outline-none ring-ring focus-visible:ring-2 ${r.variantLocked ? "bg-muted/50 text-muted-foreground cursor-default" : "bg-card"}`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Subtotal</Label>
                        <div className="flex h-10 items-center justify-end rounded-lg border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                          {formatINR(rowSubtotal(r))}
                        </div>
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="h-10 w-10 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                          disabled={rows.length === 1}
                          onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Billing Summary ── */}
              <div className="mt-5 rounded-xl border bg-muted/20 overflow-hidden">
                {/* Subtotal row */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <span className="text-sm text-muted-foreground font-medium">Subtotal</span>
                  <span className="text-sm font-semibold tabular-nums">{formatINR(invoiceSubtotal)}</span>
                </div>

                {/* Overall Discount input row */}
                <div className="flex items-center justify-between px-4 py-3 border-b gap-4">
                  <label htmlFor="overall-discount" className="text-sm text-muted-foreground font-medium shrink-0">Overall Discount (₹)</label>
                  <div className="flex flex-col items-end gap-1">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                      <input
                        id="overall-discount"
                        type="number" inputMode="decimal" min={0} step="any"
                        value={overallDiscount}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setOverallDiscount(v);
                        }}
                        className={`h-10 w-36 rounded-lg border pl-7 pr-3 text-sm tabular-nums outline-none ring-ring focus-visible:ring-2 bg-card ${
                          discountError ? "border-red-400 text-red-600" : ""
                        }`}
                      />
                    </div>
                    {discountError && <p className="text-[11px] text-red-500 font-medium">{discountError}</p>}
                  </div>
                </div>

                {/* Grand Total row */}
                <div className="flex items-center justify-between px-4 py-4 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                  <span className="text-sm font-medium opacity-90">Grand Total</span>
                  <span className="font-display text-2xl font-bold tabular-nums">{formatINR(grand)}</span>
                </div>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11 rounded-xl px-6" onClick={() => navigate({ to: "/" })}>Cancel</Button>
              <Button type="submit" disabled={saving} className="h-11 rounded-xl px-6 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Purchase
              </Button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}