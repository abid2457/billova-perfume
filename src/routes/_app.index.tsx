import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, TrendingUp, Search, Eye, CalendarDays, Hash, Printer, MessageCircle, CreditCard, Banknote, Smartphone, Building } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { AppHeader } from "@/components/app-header";
import { StatCard } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PurchaseDetailsModal } from "@/components/purchase-details-modal";
import { formatINR, formatDate } from "@/lib/types";
import { fetchDashboardStats, fetchRevenueTrend, fetchTopProducts, fetchTopCustomers, fetchPurchases, fetchPaymentAnalytics } from "@/lib/data";
import { printThermalReceipt, sendWhatsAppBill } from "@/lib/receipt";
import type { Purchase } from "@/lib/types";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — Hira Perfumes" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0, todayRevenue: 0, monthlyRevenue: 0,
    totalCustomers: 0, totalPurchases: 0, totalProductsSold: 0, thisMonth: 0, today: 0,
    avgOrder: 0, revenuePerCustomer: 0,
  });
  const [revenueSeries, setRevenueSeries] = useState<{ label: string; revenue: number; orders: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; revenue: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; total: number }[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAnalytics, setPayAnalytics] = useState<{ today: Record<string, number>; month: Record<string, number> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // All stats from single-source data layer — no duplicate calculations
        const [s, rev, top, topC, p, pay] = await Promise.all([
          fetchDashboardStats(),
          fetchRevenueTrend(),
          fetchTopProducts(),
          fetchTopCustomers(),
          fetchPurchases({ limit: 8 }),
          fetchPaymentAnalytics(),
        ]);
        if (!cancelled) {
          setStats(s);
          setRevenueSeries(rev);
          setTopProducts(top);
          setTopCustomers(topC);
          setPurchases(p);
          setPayAnalytics(pay);
        }
      } catch (e) { console.error(e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = purchases.filter((p) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return p.customers?.customer_name?.toLowerCase().includes(s) || p.customers?.phone_number?.includes(s);
  });

  if (loading) {
    return (
      <>
        <AppHeader title="Dashboard" />
        <main className="flex-1 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="h-80 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
            <div className="h-80 animate-pulse rounded-2xl bg-muted" />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Dashboard" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Welcome back to Hira Perfumes</h2>
          <p className="text-sm text-muted-foreground">A quick look at your fragrance sales today.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Today's Revenue" value={formatINR(stats.todayRevenue)} icon={CalendarDays} tone="primary" />
          <StatCard label="Monthly Revenue" value={formatINR(stats.monthlyRevenue)} icon={TrendingUp} trend="Current month" />
          <StatCard label="Total Customers" value={String(stats.totalCustomers)} icon={Users} tone="primary" />
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="overflow-hidden rounded-2xl border bg-card lg:col-span-2" style={{ boxShadow: "var(--shadow-elegant)" }}>
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h3 className="font-display text-base font-semibold">Revenue Trend</h3>
                <p className="text-xs text-muted-foreground">Weekly sales over the last 12 weeks.</p>
              </div>
              <div className="hidden text-right sm:block">
                <div className="font-display text-2xl font-bold">{formatINR(stats.totalRevenue)}</div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">All time</div>
              </div>
            </div>
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={50}
                    tickFormatter={(v) => v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: number) => [formatINR(v), "Revenue"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#revFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
            <div className="border-b p-5">
              <h3 className="font-display text-base font-semibold">Top Fragrances</h3>
              <p className="text-xs text-muted-foreground">Best-selling by revenue.</p>
            </div>
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: number) => [formatINR(v), "Revenue"]}
                    cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                  />
                  <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Top Customers */}
        <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="border-b p-5">
            <h3 className="font-display text-base font-semibold">Top Customers</h3>
            <p className="text-xs text-muted-foreground">Highest lifetime spenders.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3 text-left font-medium">#</th><th className="px-5 py-3 text-left font-medium">Customer</th><th className="px-5 py-3 text-right font-medium">Total Spent</th></tr>
              </thead>
              <tbody className="divide-y">
                {topCustomers.map((c, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                          {c.name.charAt(0)}
                        </div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatINR(c.total)}</td>
                  </tr>
                ))}
                {topCustomers.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">No customers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Payment Method Analytics */}
        {payAnalytics && (() => {
          const methodConfig: { key: string; label: string; icon: any; color: string; bg: string }[] = [
            { key: "Cash", label: "Cash", icon: Banknote, color: "#16a34a", bg: "#dcfce7" },
            { key: "UPI", label: "UPI", icon: Smartphone, color: "#7c3aed", bg: "#ede9fe" },
            { key: "Card", label: "Card", icon: CreditCard, color: "#2563eb", bg: "#dbeafe" },
            { key: "Bank Transfer", label: "Bank Transfer", icon: Building, color: "#ea580c", bg: "#ffedd5" },
          ];
          const monthTotal = Object.values(payAnalytics.month).reduce((s, v) => s + v, 0);
          return (
            <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
              <div className="border-b p-5">
                <h3 className="font-display text-base font-semibold">Payment Methods</h3>
                <p className="text-xs text-muted-foreground">Monthly revenue by payment method (includes mixed payment breakdowns).</p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                {methodConfig.map((m) => {
                  const val = payAnalytics.month[m.key] ?? 0;
                  const pct = monthTotal > 0 ? (val / monthTotal) * 100 : 0;
                  const Icon = m.icon;
                  return (
                    <div key={m.key} className="rounded-xl border p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: m.bg }}>
                          <Icon className="h-4 w-4" style={{ color: m.color }} />
                        </div>
                        <span className="text-sm font-medium">{m.label}</span>
                      </div>
                      <div className="font-display text-xl font-bold tabular-nums">{formatINR(val)}</div>
                      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: m.color }} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{pct.toFixed(1)}% of monthly revenue</div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* Recent Purchases */}
        <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h3 className="font-display text-base font-semibold">Recent Purchases</h3>
              <p className="text-xs text-muted-foreground">Latest transactions across all customers.</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="h-10 rounded-xl pl-9" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Invoice</th>
                  <th className="px-5 py-3 text-left font-medium">Customer</th>
                  <th className="hidden px-5 py-3 text-left font-medium sm:table-cell">Date</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-3.5"><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"><Hash className="h-3 w-3" />{p.invoice_number}</span></td>
                    <td className="px-5 py-3.5"><div className="font-medium">{p.customers?.customer_name ?? "Walk-in Customer"}</div><div className="text-xs text-muted-foreground">{p.customers?.phone_number ?? ""}</div></td>
                    <td className="hidden px-5 py-3.5 text-muted-foreground sm:table-cell">{formatDate(p.purchase_date)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold">{formatINR(p.total_amount)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2" onClick={() => printThermalReceipt(p)} title="Print"><Printer className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-green-700" disabled={!p.customers?.phone_number} onClick={() => sendWhatsAppBill(p)} title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2" onClick={() => setActive(p)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No purchases found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {active && <PurchaseDetailsModal purchase={active as any} open={!!active} onOpenChange={(v) => !v && setActive(null)} />}
    </>
  );
}