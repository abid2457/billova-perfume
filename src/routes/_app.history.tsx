import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Phone, User, ShoppingBag, Wallet, CalendarDays, Loader2, Download, TrendingUp, Filter, Printer, ArrowRight, ArrowUpDown, MessageCircle, FileText, RotateCcw, Hash, Clock, Pencil, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatINR } from "@/lib/types";
import { fetchCustomerStats, fetchPurchasesByPhone, fetchRecentCustomers, searchCustomers, fetchPurchasesByCustomerId, fetchCustomerByPhone, fetchReceiptStats, fetchPurchaseByInvoice } from "@/lib/data";
import { printThermalReceipt, sendWhatsAppBill, downloadInvoicePDF } from "@/lib/receipt";
import type { Purchase, Customer } from "@/lib/types";
import { AdminPasscodeModal } from "@/components/admin-passcode-modal";
import { EditPurchaseModal } from "@/components/edit-purchase-modal";
import { QuickBillsTab } from "@/components/quick-bills-tab";

type HistoryTab = "customers" | "quick";

export const Route = createFileRoute("/_app/history")({
  head: () => ({ meta: [{ title: "Purchase History — Billova Perfumes" }] }),
  component: History,
  validateSearch: (s: Record<string, unknown>) => ({ phone: (s.phone as string) ?? "" }),
});

function History() {
  const initial = Route.useSearch().phone;
  const [activeTab, setActiveTab] = useState<HistoryTab>(initial ? "customers" : "customers");
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sugIdx, setSugIdx] = useState(-1);
  const [stats, setStats] = useState<{
    name: string; phone: string; count: number; total: number;
    first: string | null; last: string | null; avg: number;
  } | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [recentCustomers, setRecentCustomers] = useState<{ name: string; phone: string; total: number; count: number; last: string }[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentSort, setRecentSort] = useState<"recent" | "name">("recent");
  const [sugLoading, setSugLoading] = useState(false);
  const [receiptStats, setReceiptStats] = useState<Map<string, { printCount: number; whatsappCount: number; lastPrinted: string | null; lastWhatsapp: string | null }>>(new Map());
  const [reprintInvoice, setReprintInvoice] = useState("");
  const [reprintLoading, setReprintLoading] = useState(false);
  // Edit purchase flow
  const [passkodeTarget, setPasskodeTarget] = useState<Purchase | null>(null);
  const [editPurchase,   setEditPurchase]   = useState<Purchase | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const sugRef = useRef<HTMLDivElement>(null);

  const handleEditClick = (p: Purchase) => setPasskodeTarget(p);

  const handlePasscodeVerified = () => {
    setEditPurchase(passkodeTarget);
    setPasskodeTarget(null);
  };

  /** After a successful edit, re-fetch the purchases list */
  const handleEditSaved = useCallback(async () => {
    if (!stats) return;
    const [s, p] = await Promise.all([fetchCustomerStats(stats.phone), fetchPurchasesByPhone(stats.phone)]);
    setStats(s ? { ...s, avg: s.avg } : null);
    setPurchases(p);
    if (p.length > 0) { const rs = await fetchReceiptStats(p.map((x) => x.id)); setReceiptStats(rs); }
  }, [stats]);

  // Load recent customers on mount
  useEffect(() => {
    fetchRecentCustomers(12).then(setRecentCustomers).catch(console.error).finally(() => setRecentLoading(false));
    const handler = (e: MouseEvent) => { if (sugRef.current && !sugRef.current.contains(e.target as Node)) setShowSuggestions(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Live search suggestions
  const onInput = (val: string) => {
    setQuery(val);
    clearTimeout(timer.current);
    if (val.length >= 2) {
      setSugLoading(true);
      setShowSuggestions(true);
      timer.current = setTimeout(async () => {
        const results = await searchCustomers(val);
        setSuggestions(results);
        setSugIdx(-1);
        setSugLoading(false);
      }, 200);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSugLoading(false);
    }
  };

  const doSearch = useCallback(async (phone: string) => {
    if (!phone.trim()) return;
    setLoading(true);
    setSearched(true);
    setShowSuggestions(false);
    try {
      const [s, p] = await Promise.all([fetchCustomerStats(phone.trim()), fetchPurchasesByPhone(phone.trim())]);
      setStats(s ? { ...s, avg: s.avg } : null);
      setPurchases(p);
      // Load receipt stats for all purchases
      if (p.length > 0) {
        const rs = await fetchReceiptStats(p.map((x) => x.id));
        setReceiptStats(rs);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const selectCustomer = (c: Customer) => {
    setQuery(c.phone_number);
    setShowSuggestions(false);
    doSearch(c.phone_number);
  };

  const selectRecentCustomer = (phone: string) => {
    setQuery(phone);
    doSearch(phone);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSugIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSugIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && sugIdx >= 0) { e.preventDefault(); selectCustomer(suggestions[sugIdx]); setSugIdx(-1); }
  };

  // Auto-search if phone from URL
  useEffect(() => { if (initial) doSearch(initial); }, []);

  // Date filter
  const filtered = dateFilter
    ? purchases.filter((p) => { const d = new Date(p.purchase_date); const [y, m] = dateFilter.split("-").map(Number); return d.getFullYear() === y && d.getMonth() + 1 === m; })
    : purchases;

  // Highlight matching text
  const highlight = (text: string, term: string) => {
    if (!term || term.length < 2) return text;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return <>{text.slice(0, idx)}<mark className="rounded bg-yellow-200 px-0.5">{text.slice(idx, idx + term.length)}</mark>{text.slice(idx + term.length)}</>;
  };

  // CSV export
  const exportCSV = () => {
    if (!stats || filtered.length === 0) return;
    let csv = "Invoice,Date,Products,Qty,Total,Payment\n";
    filtered.forEach((p) => {
      const prods = (p.purchase_items ?? []).map((i) => `${i.product_name} x${i.quantity}`).join("; ");
      csv += `${p.invoice_number},${formatDate(p.purchase_date)},"${prods}",${p.purchase_items?.reduce((s, i) => s + i.quantity, 0) ?? 0},${p.total_amount},${p.payment_method ?? ""}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${stats.name}_history.csv`; a.click();
  };

  // Reprint by invoice number
  const handleReprint = async () => {
    if (!reprintInvoice.trim()) return;
    setReprintLoading(true);
    try {
      const p = await fetchPurchaseByInvoice(reprintInvoice.trim().toUpperCase());
      if (p) printThermalReceipt(p);
      else { const { toast } = await import("sonner"); toast.error(`Invoice ${reprintInvoice} not found.`); }
    } catch (e) { console.error(e); }
    setReprintLoading(false);
  };

  return (
    <>
      <AppHeader title="Purchase History" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        {/* ── Tab Switcher ── */}
        <div className="flex gap-2 no-print">
          <button
            onClick={() => setActiveTab("customers")}
            className={`flex items-center gap-2 rounded-xl border-2 px-5 py-2.5 text-sm font-semibold transition-all ${
              activeTab === "customers"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-sm"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            <User className="h-4 w-4" />
            Customer History
          </button>
          <button
            onClick={() => setActiveTab("quick")}
            className={`flex items-center gap-2 rounded-xl border-2 px-5 py-2.5 text-sm font-semibold transition-all ${
              activeTab === "quick"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-sm"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            <Zap className="h-4 w-4" />
            Quick Bills
          </button>
        </div>

        {/* ── Quick Bills Tab ── */}
        {activeTab === "quick" && <QuickBillsTab />}

        {/* ── Customer History Tab ── */}
        {activeTab === "customers" && (
        <>
        {/* Hero banner */}
        <section className="overflow-hidden rounded-3xl text-primary-foreground no-print" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-lift)" }}>
          <div className="px-6 py-10 sm:px-10 sm:py-12">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Look up a customer's history</h2>
            <p className="mt-2 max-w-xl text-sm text-white/80">Search by phone number or customer name to view complete purchase history.</p>
          </div>
        </section>

        {/* Search bar — positioned OUTSIDE hero so dropdown is never clipped */}
        <div ref={sugRef} className="relative -mt-8 px-2 sm:px-6 no-print" style={{ zIndex: 50 }}>
          <div className="mx-auto max-w-2xl">
            <form onSubmit={(e) => { e.preventDefault(); doSearch(query); }}
              className="flex gap-2 rounded-2xl border bg-card p-2 shadow-xl">
              <div className="relative flex-1">
                <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => onInput(e.target.value)} onKeyDown={onKeyDown}
                  placeholder="Search by phone number or name..."
                  className="h-12 rounded-xl border-0 bg-muted/40 pl-11 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:bg-muted/60" />
              </div>
              <Button type="submit" disabled={loading} className="h-12 rounded-xl px-6 font-semibold"
                style={{ background: "var(--gradient-primary)" }}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Search
              </Button>
            </form>

            {/* ── Suggestions Dropdown ── */}
            {showSuggestions && (
              <div className="absolute left-2 right-2 top-full mt-2 overflow-hidden rounded-2xl border bg-card shadow-2xl sm:left-6 sm:right-6"
                style={{ zIndex: 60, maxHeight: "380px" }}>
                {sugLoading ? (
                  /* Loading skeleton */
                  <div className="space-y-0 divide-y p-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-4 py-4">
                        <div className="h-11 w-11 animate-pulse rounded-xl bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : suggestions.length === 0 ? (
                  /* No results state */
                  <div className="px-5 py-8 text-center">
                    <User className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">No customers found</p>
                    <p className="mt-1 text-xs text-muted-foreground">No match for "{query}"</p>
                    <a href="/customers" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <span className="text-lg leading-none">+</span> Add New Customer
                    </a>
                  </div>
                ) : (
                  /* Results list */
                  <>
                    <div className="border-b bg-muted/30 px-4 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {suggestions.length} customer{suggestions.length > 1 ? "s" : ""} found
                      </p>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: "320px" }}>
                      {suggestions.map((c, i) => (
                        <button key={c.id} onClick={() => selectCustomer(c)}
                          className={`group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-accent/60 ${i === sugIdx ? "bg-accent" : ""} ${i < suggestions.length - 1 ? "border-b border-dashed" : ""}`}>
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-primary-foreground"
                            style={{ background: "var(--gradient-primary)" }}>
                            {c.customer_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{highlight(c.customer_name, query)}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" /> {highlight(c.phone_number, query)}
                              </span>
                              {c.email && (
                                <span className="truncate text-xs text-muted-foreground">· {c.email}</span>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {loading && <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>}

        {/* ── Recent Customers ── table layout, shown when no search */}
        {!loading && !searched && (
          <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>

            {/* Section header */}
            <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-base font-semibold">Recent Customers</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {recentCustomers.length} recent · sorted by {recentSort === "recent" ? "last purchase" : "name"}
                </p>
              </div>
              {recentCustomers.length > 1 && (
                <Button
                  variant="outline" size="sm"
                  className="self-start rounded-xl text-xs gap-1.5 sm:self-auto"
                  onClick={() => setRecentSort(recentSort === "recent" ? "name" : "recent")}
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {recentSort === "recent" ? "Sort by Name" : "Sort by Recent"}
                </Button>
              )}
            </div>

            {/* Content */}
            {recentLoading ? (
              /* Skeleton rows */
              <div className="divide-y">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="hidden h-3.5 w-24 animate-pulse rounded bg-muted sm:block" />
                    <div className="hidden h-4 w-8 animate-pulse rounded bg-muted sm:block" />
                    <div className="hidden h-4 w-16 animate-pulse rounded bg-muted sm:block" />
                    <div className="hidden h-4 w-20 animate-pulse rounded bg-muted sm:block" />
                    <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />
                  </div>
                ))}
              </div>
            ) : recentCustomers.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <User className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium text-muted-foreground">No recent customers found.</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Recent customers will appear here after purchases are made.</p>
              </div>
            ) : (
              /* Table */
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
                    {[...recentCustomers]
                      .sort((a, b) => recentSort === "name" ? a.name.localeCompare(b.name) : 0)
                      .map((c, i) => (
                        <tr
                          key={i}
                          className="cursor-pointer transition-colors hover:bg-muted/30"
                          onClick={() => selectRecentCustomer(c.phone)}
                        >
                          {/* Avatar + Name */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-primary-foreground"
                                style={{ background: "var(--gradient-primary)" }}
                              >
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <p className="truncate font-medium">{c.name}</p>
                            </div>
                          </td>
                          {/* Phone */}
                          <td className="px-5 py-3.5 tabular-nums text-muted-foreground">{c.phone}</td>
                          {/* Purchases */}
                          <td className="px-5 py-3.5 text-center font-semibold">{c.count}</td>
                          {/* Total Spent */}
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatINR(c.total)}</td>
                          {/* Last Purchase */}
                          <td className="px-5 py-3.5 text-muted-foreground">{c.last ? formatDate(c.last) : "—"}</td>
                          {/* History Button */}
                          <td className="px-5 py-3.5 text-right">
                            <Button
                              variant="outline" size="sm"
                              className="h-8 rounded-lg text-xs"
                              onClick={(e) => { e.stopPropagation(); selectRecentCustomer(c.phone); }}
                            >
                              <Clock className="mr-1 h-3 w-3" /> History
                            </Button>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!loading && searched && !stats && (
          <EmptyState title="No purchases found" description={`No history for "${query}". Try another number or name.`} />
        )}

        {!loading && stats && (
          <>
            {/* ── Customer Summary Card (responsive grid) ── */}
            <section className="rounded-2xl border bg-card p-5 sm:p-6" style={{ boxShadow: "var(--shadow-elegant)" }}>
              <div className="flex items-center gap-4 border-b pb-5">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>{stats.name.charAt(0)}</div>
                <div className="min-w-0">
                  <p className="font-display truncate text-xl font-bold">{stats.name}</p>
                  <p className="text-sm text-muted-foreground">{stats.phone}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <MiniStat icon={ShoppingBag} label="Purchases" value={String(stats.count)} />
                <MiniStat icon={Wallet} label="Total Spent" value={formatINR(stats.total)} />
                <MiniStat icon={TrendingUp} label="Avg Order" value={formatINR(stats.avg)} />
                <MiniStat icon={CalendarDays} label="First Visit" value={stats.first ? formatDate(stats.first) : "—"} />
                <MiniStat icon={CalendarDays} label="Latest Visit" value={stats.last ? formatDate(stats.last) : "—"} />
              </div>
            </section>

            {/* Filters + Export */}
            <div className="flex flex-wrap items-center gap-2 no-print">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-9 rounded-xl border bg-card px-3 text-sm">
                  <option value="">All Dates</option>
                  {(() => {
                    const months = [...new Set(purchases.map((p) => {
                      const d = new Date(p.purchase_date);
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                    }))].sort().reverse();
                    return months.map((m) => {
                      const [y, mo] = m.split("-");
                      const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
                      return <option key={m} value={m}>{label}</option>;
                    });
                  })()}
                </select>
                {dateFilter && <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setDateFilter("")}>Clear</Button>}
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={exportCSV}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
              </div>
            </div>

            {/* Timeline */}
            <section>
              <h3 className="font-display mb-4 text-lg font-semibold">Purchase Timeline <span className="text-sm font-normal text-muted-foreground">({filtered.length} records)</span></h3>
              {filtered.length === 0 ? (
                <EmptyState title="No purchases in this period" description="Try a different date filter." />
              ) : (
                <ol className="relative space-y-5 border-l-2 border-dashed pl-6">
                  {filtered.map((p) => {
                    const rs = receiptStats.get(p.id);
                    return (
                    <li key={p.id} className="relative">
                      <span className="absolute -left-[29px] top-5 grid h-4 w-4 place-items-center rounded-full border-2 border-primary bg-card"><span className="h-1.5 w-1.5 rounded-full bg-primary" /></span>
                      <div className="overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5" style={{ boxShadow: "var(--shadow-elegant)" }}>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800"><Hash className="h-3 w-3" />{p.invoice_number}</span>
                              {p.is_edited && (
                                <span title={p.edited_at ? `Edited on ${new Date(p.edited_at).toLocaleString("en-IN")}` : "Edited"}
                                  className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 cursor-help">
                                  ✏ Edited
                                </span>
                              )}
                              {rs && rs.printCount > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">🖨 {rs.printCount}×</span>}
                              {rs && rs.whatsappCount > 0 && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">💬 {rs.whatsappCount}×</span>}
                            </div>
                            <p className="mt-1 font-display text-base font-semibold">{formatDate(p.purchase_date)}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {p.payment_method === "Mixed" && p.purchase_payments && p.purchase_payments.length > 0 ? (
                              p.purchase_payments.map((pp, idx) => (
                                <span key={idx} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                                  {pp.payment_method} {formatINR(pp.amount)}
                                </span>
                              ))
                            ) : (
                              p.payment_method && (() => {
                                const displayMethod = p.payment_method === "UPI" && p.upi_account
                                  ? `UPI (${p.upi_account === "upi_1" ? "UPI 1" : p.upi_account === "upi_2" ? "UPI 2" : "UPI 3"})`
                                  : p.payment_method;
                                return <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{displayMethod}</span>;
                              })()
                            )}
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Completed</span>
                          </div>
                        </div>
                        <div className="overflow-x-auto p-4 sm:p-5">
                          <table className="w-full text-sm">
                            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              <tr><th className="pb-2 text-left font-medium">Product</th><th className="pb-2 text-right font-medium">Qty</th><th className="pb-2 text-right font-medium">Price</th><th className="pb-2 text-right font-medium">Total</th></tr>
                            </thead>
                            <tbody className="divide-y">
                              {(p.purchase_items ?? []).map((it, i) => (
                                <tr key={i}><td className="py-2">{it.product_name}</td><td className="py-2 text-right text-muted-foreground">{it.quantity}</td><td className="py-2 text-right text-muted-foreground">{formatINR(it.unit_price)}</td><td className="py-2 text-right font-medium">{formatINR(it.total)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:p-5">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => printThermalReceipt(p)}><Printer className="mr-1 h-3.5 w-3.5" /> Print</Button>
                            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => downloadInvoicePDF(p)}><FileText className="mr-1 h-3.5 w-3.5" /> PDF</Button>
                            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs text-green-700 hover:bg-green-50" disabled={!p.customers?.phone_number} onClick={() => sendWhatsAppBill(p)}><MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp</Button>
                             <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs text-violet-700 hover:bg-violet-50" onClick={() => handleEditClick(p)}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                          </div>
                          <div className="text-right space-y-0.5">
                            {(() => {
                              const subtotal = (p.purchase_items ?? []).reduce((s, it) => s + it.quantity * it.unit_price, 0);
                              const disc = (p as any).overall_discount ?? 0;
                              return (
                                <>
                                  {disc > 0 && (
                                    <>
                                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Subtotal</p>
                                      <p className="text-base font-semibold tabular-nums">{formatINR(subtotal)}</p>
                                      <p className="text-[11px] uppercase tracking-wider text-red-500 mt-1">Discount</p>
                                      <p className="text-sm font-semibold text-red-500 tabular-nums">-{formatINR(disc)}</p>
                                    </>
                                  )}
                                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">Grand Total</p>
                                  <p className="font-display text-2xl font-bold">{formatINR(p.total_amount)}</p>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        {p.notes && <div className="border-t px-4 py-2 sm:px-5"><p className="text-xs italic text-muted-foreground">Note: {p.notes}</p></div>}
                      </div>
                    </li>
                  );})}
                </ol>
              )}
            </section>
          </>
        )}
        </>
        )}
      </main>

      {/* ── Admin passcode gate ── */}
      <AdminPasscodeModal
        open={!!passkodeTarget}
        onCancel={() => setPasskodeTarget(null)}
        onVerified={handlePasscodeVerified}
      />

      {/* ── Edit purchase form ── */}
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

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <p className="font-display mt-1 truncate text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}