import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Search, Plus, Pencil, History, ChevronLeft, ChevronRight, Users, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fetchCustomers, createCustomer, updateCustomer, fetchCustomerByPhone } from "@/lib/data";
import { formatINR, formatDate } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import type { Customer } from "@/lib/types";

export const Route = createFileRoute("/_app/customers")({
  head: () => ({ meta: [{ title: "Customers — Hira Perfumes" }] }),
  component: CustomersPage,
});

const PAGE_SIZE = 10;
type SortKey = "name" | "spent" | "purchases" | "recent";
type CustomerRow = Customer & { totalSpent: number; purchaseCount: number; lastPurchase: string | null };

function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>("spent");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ customer_name: "", phone_number: "", email: "", address: "", notes: "" });
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const custs = await fetchCustomers(q || undefined);
      // Enrich with purchase stats
      const { data: purchases } = await supabase
        .from("purchases")
        .select("customer_id, total_amount, purchase_date")
        .order("purchase_date", { ascending: false });

      const statsMap = new Map<string, { total: number; count: number; last: string | null }>();
      (purchases ?? []).forEach((p: any) => {
        const cur = statsMap.get(p.customer_id) ?? { total: 0, count: 0, last: null };
        cur.total += p.total_amount;
        cur.count += 1;
        if (!cur.last) cur.last = p.purchase_date;
        statsMap.set(p.customer_id, cur);
      });

      const enriched: CustomerRow[] = custs.map((c) => {
        const s = statsMap.get(c.id) ?? { total: 0, count: 0, last: null };
        return { ...c, totalSpent: s.total, purchaseCount: s.count, lastPurchase: s.last };
      });

      // Sort
      enriched.sort((a, b) => {
        if (sort === "name") return a.customer_name.localeCompare(b.customer_name);
        if (sort === "spent") return b.totalSpent - a.totalSpent;
        if (sort === "purchases") return b.purchaseCount - a.purchaseCount;
        if (sort === "recent") return (b.lastPurchase ?? "").localeCompare(a.lastPurchase ?? "");
        return 0;
      });

      setCustomers(enriched);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [q, sort]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const current = customers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openNew = () => { setEditing(null); setForm({ customer_name: "", phone_number: "", email: "", address: "", notes: "" }); setFormError(""); setDialogOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ customer_name: c.customer_name, phone_number: c.phone_number, email: c.email ?? "", address: c.address ?? "", notes: c.notes ?? "" });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.customer_name.trim()) { setFormError("Name is required."); return; }
    if (!form.phone_number.trim() || form.phone_number.trim().length < 10) { setFormError("Valid phone number required (10+ digits)."); return; }

    // Duplicate phone check
    const existing = await fetchCustomerByPhone(form.phone_number.trim());
    if (existing && (!editing || existing.id !== editing.id)) {
      setFormError(`Phone ${form.phone_number} already belongs to ${existing.customer_name}.`);
      return;
    }

    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        phone_number: form.phone_number.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await updateCustomer(editing.id, payload);
        toast.success("Customer updated");
      } else {
        await createCustomer(payload);
        toast.success("Customer added");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) { setFormError(e?.message ?? "Error saving customer"); }
  };


  return (
    <>
      <AppHeader title="Customers" />
      <main className="flex-1 p-4 sm:p-6">
        <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold">All Customers</h3>
              <p className="text-xs text-muted-foreground">{customers.length} total · sorted by {sort}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by name or phone" className="h-10 w-full rounded-xl pl-9 sm:w-56" />
              </div>
              <select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }} className="h-10 rounded-xl border bg-card px-3 text-sm">
                <option value="spent">Sort: Total Spent</option>
                <option value="name">Sort: Name</option>
                <option value="purchases">Sort: Purchases</option>
                <option value="recent">Sort: Recent Activity</option>
              </select>
              <Button onClick={openNew} className="h-10 rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Customer
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">{[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Customer</th>
                    <th className="px-5 py-3 text-left font-medium">Phone</th>
                    <th className="px-5 py-3 text-center font-medium">Purchases</th>
                    <th className="px-5 py-3 text-right font-medium">Total Spent</th>
                    <th className="px-5 py-3 text-left font-medium">Last Purchase</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {current.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                            {c.customer_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.customer_name}</p>
                            {c.email && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground tabular-nums">{c.phone_number}</td>
                      <td className="px-5 py-3.5 text-center font-semibold">{c.purchaseCount}</td>
                      <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatINR(c.totalSpent)}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{c.lastPurchase ? formatDate(c.lastPurchase) : "—"}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs"
                            onClick={() => navigate({ to: "/history", search: { phone: c.phone_number } })}>
                            <History className="mr-1 h-3 w-3" /> History
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {current.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No customers found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" disabled={page === pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </section>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {formError && <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>}
            <div className="space-y-1.5"><Label>Customer Name *</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="rounded-xl" placeholder="Name" /></div>
            <div className="space-y-1.5"><Label>Phone Number *</Label><Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} className="rounded-xl" placeholder="10-digit mobile" maxLength={15} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl" placeholder="Optional" /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-xl" placeholder="Optional" /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-xl" placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSave} className="rounded-xl text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}