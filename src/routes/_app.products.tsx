import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Search, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Package, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fetchProducts, createProduct, updateProduct, deleteProduct, fetchCategories, upsertVariants } from "@/lib/data";
import { formatINR } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import type { Product, ProductVariant } from "@/lib/types";

export const Route = createFileRoute("/_app/products")({
  head: () => ({ meta: [{ title: "Products — Hira Perfumes" }] }),
  component: ProductsPage,
});

const PAGE_SIZE = 10;
type SortKey = "name" | "price" | "revenue" | "sold";
type ProductRow = Product & { totalSold: number; totalRevenue: number; timesPurchased: number };

// ─── Variant row used in the form ────────────────────────────────────────────
type VariantForm = {
  id?: string;        // existing variant id (if editing)
  ml: string;
  selling_price: string;
  error?: string;
};

function emptyVariant(): VariantForm { return { ml: "", selling_price: "" }; }

function ProductsPage() {
  const [products, setProducts]     = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ]                   = useState("");
  const [catFilter, setCatFilter]   = useState("");
  const [sort, setSort]             = useState<SortKey>("revenue");
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<Product | null>(null);
  const [deleting, setDeleting]     = useState<Product | null>(null);

  // Product form fields
  const [form, setForm]         = useState({ product_name: "", category: "", description: "" });
  const [variants, setVariants] = useState<VariantForm[]>([emptyVariant()]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      const [prods, cats] = await Promise.all([fetchProducts(q || undefined), fetchCategories()]);
      setCategories(cats);

      const { data: items } = await supabase.from("purchase_items").select("product_name, quantity, total");
      const salesMap = new Map<string, { sold: number; revenue: number; count: number }>();
      (items ?? []).forEach((i: any) => {
        const cur = salesMap.get(i.product_name) ?? { sold: 0, revenue: 0, count: 0 };
        cur.sold     += i.quantity;
        cur.revenue  += i.total;
        cur.count    += 1;
        salesMap.set(i.product_name, cur);
      });

      const enriched: ProductRow[] = prods.map((p) => {
        const s = salesMap.get(p.product_name) ?? { sold: 0, revenue: 0, count: 0 };
        return { ...p, totalSold: s.sold, totalRevenue: s.revenue, timesPurchased: s.count };
      });

      enriched.sort((a, b) => {
        if (sort === "name")    return a.product_name.localeCompare(b.product_name);
        if (sort === "price")   return b.selling_price - a.selling_price;
        if (sort === "revenue") return b.totalRevenue - a.totalRevenue;
        if (sort === "sold")    return b.totalSold - a.totalSold;
        return 0;
      });

      setProducts(enriched);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [q, sort]);

  useEffect(() => { load(); }, [load]);

  const filtered = catFilter ? products.filter((p) => p.category === catFilter) : products;
  const pages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Open Add dialog ──
  const openNew = () => {
    setEditing(null);
    setForm({ product_name: "", category: "", description: "" });
    setVariants([emptyVariant()]);
    setFormError("");
    setDialogOpen(true);
  };

  // ── Open Edit dialog ──
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ product_name: p.product_name, category: p.category ?? "", description: p.description ?? "" });
    const existingVariants: VariantForm[] = (p.product_variants ?? [])
      .sort((a, b) => a.selling_price - b.selling_price)
      .map((v) => ({ id: v.id, ml: v.ml, selling_price: String(v.selling_price) }));
    setVariants(existingVariants.length > 0 ? existingVariants : [emptyVariant()]);
    setFormError("");
    setDialogOpen(true);
  };

  // ── Variant row helpers ──
  const updateVariant = (idx: number, patch: Partial<VariantForm>) =>
    setVariants((vs) => vs.map((v, i) => (i === idx ? { ...v, ...patch, error: undefined } : v)));

  const addVariant    = () => setVariants((vs) => [...vs, emptyVariant()]);
  const removeVariant = (idx: number) => setVariants((vs) => vs.filter((_, i) => i !== idx));

  // ── Validate variants ──
  function validateVariants(): boolean {
    let ok = true;
    const mlSeen = new Set<string>();
    const updated = variants.map((v) => {
      const ml    = v.ml.trim();
      const price = Number(v.selling_price);

      if (!ml) {
        ok = false;
        return { ...v, error: "ML size is required" };
      }
      if (!v.selling_price || isNaN(price) || price <= 0) {
        ok = false;
        return { ...v, error: "Valid price required" };
      }
      if (mlSeen.has(ml.toLowerCase())) {
        ok = false;
        return { ...v, error: `Duplicate size "${ml}"` };
      }
      mlSeen.add(ml.toLowerCase());
      return { ...v, error: undefined };
    });
    setVariants(updated);
    return ok;
  }

  // ── Save product + variants (atomic: both must succeed) ──
  const handleSave = async () => {
    setFormError("");
    if (!form.product_name.trim()) { setFormError("Product name is required."); return; }
    if (variants.length === 0) { setFormError("Add at least one variant."); return; }
    if (!validateVariants()) return;

    // Duplicate product name check
    const dup = products.find(
      (p) => p.product_name.toLowerCase() === form.product_name.trim().toLowerCase() &&
        (!editing || p.id !== editing.id)
    );
    if (dup) { setFormError(`Product "${form.product_name}" already exists.`); return; }

    setSaving(true);
    try {
      // Use the cheapest variant price as the product-level selling_price (backward compat)
      const minPrice = Math.min(...variants.map((v) => Number(v.selling_price)));

      const payload = {
        product_name: form.product_name.trim(),
        category: form.category.trim() || null,
        selling_price: minPrice,
        description: form.description.trim() || null,
      };

      let productId: string;
      if (editing) {
        await updateProduct(editing.id, payload);
        productId = editing.id;
      } else {
        const created = await createProduct(payload);
        productId = created.id;
      }

      // Upsert variants — clean ids to prevent null/undefined leaking
      const cleanVariants = variants.map((v) => ({
        id: (v.id && typeof v.id === "string" && v.id.length > 0) ? v.id : undefined,
        ml: v.ml.trim(),
        selling_price: Number(v.selling_price),
      }));

      await upsertVariants(productId, cleanVariants);

      // Both succeeded — show success and close
      toast.success(editing ? "Product updated" : "Product created");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      const msg = e?.message ?? "Error saving product";
      setFormError(msg);
      toast.error(msg);
      // Dialog stays open so user can retry
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try { await deleteProduct(deleting.id); toast.success("Product deleted"); setDeleting(null); load(); }
    catch (e: any) { toast.error(e?.message ?? "Error deleting"); }
  };

  return (
    <>
      <AppHeader title="Products" />
      <main className="flex-1 p-4 sm:p-6">
        <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
          {/* ── Toolbar ── */}
          <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold">Product Catalog</h3>
              <p className="text-xs text-muted-foreground">{filtered.length} products</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search products" className="h-10 w-full rounded-xl pl-9 sm:w-52" />
              </div>
              <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }} className="h-10 rounded-xl border bg-card px-3 text-sm">
                <option value="">All Categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }} className="h-10 rounded-xl border bg-card px-3 text-sm">
                <option value="revenue">Sort: Revenue</option>
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
                <option value="sold">Sort: Units Sold</option>
              </select>
              <Button onClick={openNew} className="h-10 rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Product
              </Button>
            </div>
          </div>

          {/* ── Table ── */}
          {loading ? (
            <div className="space-y-3 p-5">{[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Product</th>
                    <th className="px-5 py-3 text-left font-medium">Category</th>
                    <th className="px-5 py-3 text-left font-medium">Variants</th>
                    <th className="px-5 py-3 text-center font-medium">Sold</th>
                    <th className="px-5 py-3 text-right font-medium">Revenue</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {current.map((p) => {
                    const activeVariants = (p.product_variants ?? []).filter((v) => v.is_active);
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent">
                              <Package className="h-4 w-4 text-accent-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{p.product_name}</p>
                              {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {p.category
                            ? <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">{p.category}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          {activeVariants.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {activeVariants.slice(0, 4).map((v) => (
                                <span key={v.id} className="rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs font-medium tabular-nums">
                                  {v.ml}
                                </span>
                              ))}
                              {activeVariants.length > 4 && (
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                  +{activeVariants.length - 4}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No variants</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center tabular-nums">
                          {p.totalSold > 0 ? `${p.totalSold} units` : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {p.totalRevenue > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-green-700">
                              <TrendingUp className="h-3 w-3" /> {formatINR(p.totalRevenue)}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => setDeleting(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {current.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No products found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ── */}
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {formError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>
            )}

            {/* Product name */}
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} className="rounded-xl" placeholder="e.g. Bleu de Chanel Inspired" />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-10 w-full rounded-xl border bg-card px-3 text-sm">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl" placeholder="Optional description" />
            </div>

            {/* ── Variants section ── */}
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Variants (ML &amp; Price)</p>
                  <p className="text-xs text-muted-foreground">Each ML size has its own selling price</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={addVariant}>
                  <Plus className="mr-1 h-3 w-3" /> Add Variant
                </Button>
              </div>

              {/* Header row */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>ML Size</span>
                <span>Selling Price (₹)</span>
                <span />
              </div>

              {variants.map((v, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <Input
                      value={v.ml}
                      onChange={(e) => updateVariant(idx, { ml: e.target.value })}
                      placeholder="e.g. 30 ml"
                      className={`h-9 rounded-lg text-sm ${v.error ? "border-destructive" : ""}`}
                    />
                    <Input
                      type="number"
                      min={1}
                      value={v.selling_price}
                      onChange={(e) => updateVariant(idx, { selling_price: e.target.value })}
                      placeholder="₹ 850"
                      className={`h-9 rounded-lg text-sm tabular-nums ${v.error ? "border-destructive" : ""}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive"
                      disabled={variants.length === 1}
                      onClick={() => removeVariant(idx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {v.error && <p className="pl-1 text-xs text-destructive">{v.error}</p>}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleting?.product_name}" and all its variants. Existing purchase records will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
