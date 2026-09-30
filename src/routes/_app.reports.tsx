import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Download, FileSpreadsheet, FileText, TrendingUp, Users, Package, CreditCard, CalendarDays, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, Area, AreaChart } from "recharts";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { formatINR, formatDate } from "@/lib/types";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — Billova Perfumes" }] }),
  component: ReportsPage,
});

type Period = "daily" | "weekly" | "monthly" | "yearly";
type Tab = "overview" | "products" | "customers" | "payments";

/** Format YYYY-MM-DD → "10 Aug 2026" using IST noon to avoid date-shift */
function formatExactDate(d: string) {
  return new Date(d + "T12:00:00+05:30").toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function ReportsPage() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [exactDate, setExactDate] = useState<string | null>(null); // YYYY-MM-DD in IST
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({ revenue: 0, orders: 0, avgOrder: 0, customers: 0, repeatCustomers: 0, todayRevenue: 0, monthlyRevenue: 0 });
  const [chartData, setChartData] = useState<{ label: string; revenue: number; orders: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; revenue: number; qty: number; orders: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; phone: string; total: number; count: number; avg: number; last: string }[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<Record<string, number>>({});
  const [paymentTxns, setPaymentTxns] = useState<{ invoice: string; customer: string; date: string; method: string; upiAccount: string | null; amount: number }[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const now = new Date();
      // IST = UTC+5:30 = 19800000 ms ahead
      const IST_MS = 5.5 * 60 * 60 * 1000;
      let startISO: string;
      let endISO: string | null = null; // null = no upper bound (open-ended)

      if (exactDate) {
        // Exact date selected — use IST day boundaries
        const [y, m, d] = exactDate.split("-").map(Number);
        startISO = new Date(Date.UTC(y, m - 1, d)     - IST_MS).toISOString();
        endISO   = new Date(Date.UTC(y, m - 1, d + 1) - IST_MS).toISOString();
      } else {
        switch (period) {
          case "daily":   startISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(); break;
          case "weekly":  { const wk = new Date(now); wk.setDate(now.getDate() - 7); startISO = wk.toISOString(); break; }
          case "monthly": startISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString(); break;
          case "yearly":  startISO = new Date(now.getFullYear(), 0, 1).toISOString(); break;
          default:        startISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        }
      }

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let purchaseQuery = supabase.from("purchases")
        .select("id, invoice_number, total_amount, purchase_date, customer_id, payment_method, upi_account, customers(customer_name, phone_number)")
        .gte("purchase_date", startISO)
        .order("purchase_date", { ascending: false });
      if (endISO) purchaseQuery = purchaseQuery.lt("purchase_date", endISO);
      const { data: purchases } = await purchaseQuery;

      // Today + Monthly revenue (always calculated)
      const { data: todayPurchases } = await supabase.from("purchases").select("total_amount").gte("purchase_date", todayStart);
      const { data: monthPurchases } = await supabase.from("purchases").select("total_amount").gte("purchase_date", monthStart);

      const list = (purchases ?? []) as any[];
      const revenue = list.reduce((s, p) => s + p.total_amount, 0);
      const customerIds = list.filter((p: any) => p.customer_id).map((p: any) => p.customer_id);
      const uniqueCustomers = new Set(customerIds).size;
      const customerCounts = new Map<string, number>();
      customerIds.forEach((id) => customerCounts.set(id, (customerCounts.get(id) ?? 0) + 1));
      const repeatCustomers = Array.from(customerCounts.values()).filter((c) => c > 1).length;

      setStats({
        revenue,
        orders: list.length,
        avgOrder: list.length > 0 ? Math.round(revenue / list.length) : 0,
        customers: uniqueCustomers,
        repeatCustomers,
        todayRevenue: (todayPurchases ?? []).reduce((s, p: any) => s + p.total_amount, 0),
        monthlyRevenue: (monthPurchases ?? []).reduce((s, p: any) => s + p.total_amount, 0),
      });

      // ── Payment Collection Summary ──
      const pSummary: Record<string, number> = {};
      const addTo = (key: string, amt: number) => { pSummary[key] = (pSummary[key] ?? 0) + amt; };

      // Fetch mixed payment allocations for purchases in this period
      const mixedIds = list.filter((p: any) => p.payment_method === "Mixed").map((p: any) => p.id);
      let mixedAllocs: any[] = [];
      for (let i = 0; i < mixedIds.length; i += 50) {
        const chunk = mixedIds.slice(i, i + 50);
        if (chunk.length === 0) break;
        const { data: rows } = await supabase.from("purchase_payments")
          .select("purchase_id, payment_method, amount")
          .in("purchase_id", chunk);
        mixedAllocs = mixedAllocs.concat(rows ?? []);
      }
      const mixedMap = new Map<string, { payment_method: string; amount: number }[]>();
      mixedAllocs.forEach((r: any) => {
        const arr = mixedMap.get(r.purchase_id) ?? [];
        arr.push({ payment_method: r.payment_method, amount: r.amount });
        mixedMap.set(r.purchase_id, arr);
      });

      list.forEach((p: any) => {
        const method: string = p.payment_method ?? "Cash";
        const amount: number = p.total_amount ?? 0;
        if (method === "Mixed") {
          (mixedMap.get(p.id) ?? []).forEach((a) => {
            const sub = a.payment_method ?? "Cash";
            if (sub === "UPI") addTo("UPI 3", a.amount);
            else addTo(sub, a.amount);
          });
        } else if (method === "UPI") {
          const acc = (p.upi_account as string | null)?.toLowerCase().trim();
          if (acc === "upi_1" || acc === "upi 1" || acc === "upi1" || acc === "1") addTo("UPI 1", amount);
          else if (acc === "upi_2" || acc === "upi 2" || acc === "upi2" || acc === "2") addTo("UPI 2", amount);
          else if (acc === "upi_3" || acc === "upi 3" || acc === "upi3" || acc === "3") addTo("UPI 3", amount);
          else addTo("UPI 3", amount);
        } else {
          addTo(method, amount);
        }
      });
      setPaymentSummary(pSummary);

      // Payment transactions list (for Payments tab)
      setPaymentTxns(list.map((p: any) => ({
        invoice: p.invoice_number ?? "",
        customer: p.customers?.customer_name ?? "Walk-in Customer",
        date: p.purchase_date,
        method: p.payment_method ?? "Cash",
        upiAccount: p.upi_account ?? null,
        amount: p.total_amount ?? 0,
      })));

      // Chart — group by day/week/month
      const bucketMap = new Map<string, { revenue: number; orders: number }>();
      list.forEach((p) => {
        const d = new Date(p.purchase_date);
        const key = period === "yearly"
          ? d.toLocaleDateString("en-IN", { month: "short" })
          : period === "monthly"
          ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
          : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        const cur = bucketMap.get(key) ?? { revenue: 0, orders: 0 };
        cur.revenue += p.total_amount;
        cur.orders += 1;
        bucketMap.set(key, cur);
      });
      setChartData(Array.from(bucketMap.entries()).map(([label, v]) => ({ label, ...v })).reverse());

      // Top products
      const purchaseIds = list.map((p) => p.id);
      let allItems: any[] = [];
      if (purchaseIds.length > 0) {
        // Batch fetch in chunks of 50
        for (let i = 0; i < purchaseIds.length; i += 50) {
          const chunk = purchaseIds.slice(i, i + 50);
          const { data: items } = await supabase.from("purchase_items")
            .select("product_name, quantity, total, purchase_id")
            .in("purchase_id", chunk);
          allItems = allItems.concat(items ?? []);
        }
      }

      const prodMap = new Map<string, { revenue: number; qty: number; orders: Set<string> }>();
      allItems.forEach((i: any) => {
        const cur = prodMap.get(i.product_name) ?? { revenue: 0, qty: 0, orders: new Set() };
        cur.revenue += i.total;
        cur.qty += i.quantity;
        cur.orders.add(i.purchase_id);
        prodMap.set(i.product_name, cur);
      });
      setTopProducts(
        Array.from(prodMap.entries())
          .map(([name, v]) => ({ name, revenue: v.revenue, qty: v.qty, orders: v.orders.size }))
          .sort((a, b) => b.revenue - a.revenue)
      );

      // Top customers — exclude Quick Bills (no customer_id)
      const custMap = new Map<string, { name: string; phone: string; total: number; count: number; last: string }>();
      list.forEach((p: any) => {
        if (!p.customer_id) return; // Skip Quick Bill (walk-in) purchases
        const key = p.customer_id;
        const cur = custMap.get(key) ?? { name: p.customers?.customer_name ?? "Unknown", phone: p.customers?.phone_number ?? "", total: 0, count: 0, last: p.purchase_date };
        cur.total += p.total_amount;
        cur.count += 1;
        custMap.set(key, cur);
      });
      setTopCustomers(
        Array.from(custMap.values())
          .map((c) => ({ ...c, avg: c.count > 0 ? Math.round(c.total / c.count) : 0 }))
          .sort((a, b) => b.total - a.total)
      );

      setLoading(false);
    })();
  }, [period, exactDate]);

  // ─── EXPORT FUNCTIONS ───
  const exportCSV = () => {
    let csv = "";
    if (tab === "overview") {
      csv = "Metric,Value\n";
      csv += `Revenue,${stats.revenue}\nOrders,${stats.orders}\nAvg Order,${stats.avgOrder}\nCustomers,${stats.customers}\nRepeat Customers,${stats.repeatCustomers}\n\n`;
      csv += "Date,Revenue,Orders\n";
      chartData.forEach((d) => { csv += `${d.label},${d.revenue},${d.orders}\n`; });
      csv += "\nPayment Collection Summary\nPayment Method,Amount\n";
      Object.entries(paymentSummary).forEach(([k, v]) => { csv += `${k},${v}\n`; });
    } else if (tab === "payments") {
      csv = "Invoice,Customer,Date,Method,Amount\n";
      paymentTxns.forEach((t) => {
        const method = t.method === "UPI" && t.upiAccount
          ? `UPI (${t.upiAccount.replace("upi_", "UPI ")})`
          : t.method;
        csv += `"${t.invoice}","${t.customer}",${t.date},${method},${t.amount}\n`;
      });
    } else if (tab === "products") {
      csv = "Product,Revenue,Units Sold,Orders\n";
      topProducts.forEach((p) => { csv += `"${p.name}",${p.revenue},${p.qty},${p.orders}\n`; });
    } else {
      csv = "Customer,Phone,Total Spent,Orders,Avg Order,Last Purchase\n";
      topCustomers.forEach((c) => { csv += `"${c.name}",${c.phone},${c.total},${c.count},${c.avg},${c.last}\n`; });
    }
    download(csv, `billova_${tab}_${exactDate ?? period}.csv`, "text/csv");
  };

  const exportExcel = () => {
    // Generate simple HTML table that Excel can open
    let html = "<html><head><meta charset='utf-8'></head><body><table border='1'>";
    if (tab === "products") {
      html += "<tr><th>Product</th><th>Revenue</th><th>Units Sold</th><th>Orders</th></tr>";
      topProducts.forEach((p) => { html += `<tr><td>${p.name}</td><td>${p.revenue}</td><td>${p.qty}</td><td>${p.orders}</td></tr>`; });
    } else if (tab === "customers") {
      html += "<tr><th>Customer</th><th>Phone</th><th>Total</th><th>Orders</th><th>Avg</th></tr>";
      topCustomers.forEach((c) => { html += `<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.total}</td><td>${c.count}</td><td>${c.avg}</td></tr>`; });
    } else if (tab === "payments") {
      html += "<tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Method</th><th>Amount</th></tr>";
      paymentTxns.forEach((t) => {
        const method = t.method === "UPI" && t.upiAccount ? `UPI (${t.upiAccount.replace("upi_", "UPI ")})` : t.method;
        html += `<tr><td>${t.invoice}</td><td>${t.customer}</td><td>${t.date.slice(0,10)}</td><td>${method}</td><td>${t.amount}</td></tr>`;
      });
    } else {
      html += "<tr><th>Metric</th><th>Value</th></tr>";
      html += `<tr><td>Revenue</td><td>${stats.revenue}</td></tr><tr><td>Orders</td><td>${stats.orders}</td></tr>`;
      html += "<tr><td colspan='2'><b>Payment Collection Summary</b></td></tr>";
      Object.entries(paymentSummary).forEach(([k, v]) => { html += `<tr><td>${k}</td><td>${v}</td></tr>`; });
    }
    html += "</table></body></html>";
    download(html, `billova_${tab}_${exactDate ?? period}.xls`, "application/vnd.ms-excel");
  };

  const exportPDF = () => {
    // Print-friendly view
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    let content = `<html><head><title>Billova Report - ${tab} (${period})</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f0eb}h1{color:#8B5E3C}h2{color:#666;font-size:14px}</style></head><body>`;
    const pdfPeriodLabel = exactDate
      ? formatExactDate(exactDate)
      : period.charAt(0).toUpperCase() + period.slice(1);
    content += `<h1>Billova Perfumes — ${tab.charAt(0).toUpperCase() + tab.slice(1)} Report</h1>`;
    content += `<h2>Period: ${pdfPeriodLabel} | Generated: ${new Date().toLocaleString("en-IN")}</h2>`;

    if (tab === "overview") {
      content += `<table><tr><th>Revenue</th><th>Orders</th><th>Avg Order</th><th>Customers</th></tr>`;
      content += `<tr><td>₹${stats.revenue.toLocaleString()}</td><td>${stats.orders}</td><td>₹${stats.avgOrder.toLocaleString()}</td><td>${stats.customers}</td></tr></table>`;
      if (Object.keys(paymentSummary).length > 0) {
        content += `<h2>Payment Collection Summary</h2><table><tr><th>Payment Method</th><th>Amount Collected</th></tr>`;
        Object.entries(paymentSummary).forEach(([k, v]) => { content += `<tr><td>${k}</td><td>₹${v.toLocaleString("en-IN")}</td></tr>`; });
        content += "</table>";
      }
    } else if (tab === "payments") {
      content += `<table><tr><th>#</th><th>Invoice</th><th>Customer</th><th>Date</th><th>Method</th><th>Amount</th></tr>`;
      paymentTxns.forEach((t, i) => {
        const method = t.method === "UPI" && t.upiAccount ? `UPI (${t.upiAccount.replace("upi_", "UPI ")})` : t.method;
        content += `<tr><td>${i+1}</td><td>${t.invoice}</td><td>${t.customer}</td><td>${new Date(t.date).toLocaleDateString("en-IN")}</td><td>${method}</td><td>₹${t.amount.toLocaleString("en-IN")}</td></tr>`;
      });
      content += "</table>";
    } else if (tab === "products") {
      content += `<table><tr><th>#</th><th>Product</th><th>Revenue</th><th>Units</th><th>Orders</th></tr>`;
      topProducts.forEach((p, i) => { content += `<tr><td>${i + 1}</td><td>${p.name}</td><td>₹${p.revenue.toLocaleString()}</td><td>${p.qty}</td><td>${p.orders}</td></tr>`; });
      content += "</table>";
    } else {
      content += `<table><tr><th>#</th><th>Customer</th><th>Phone</th><th>Total</th><th>Orders</th><th>Avg</th></tr>`;
      topCustomers.forEach((c, i) => { content += `<tr><td>${i + 1}</td><td>${c.name}</td><td>${c.phone}</td><td>₹${c.total.toLocaleString()}</td><td>${c.count}</td><td>₹${c.avg.toLocaleString()}</td></tr>`; });
      content += "</table>";
    }
    content += "</body></html>";
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  return (
    <>
      <AppHeader title="Reports" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        {/* Header with period + export */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Reports</h2>
            <p className="text-sm text-muted-foreground">Analyze your business performance.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["daily", "weekly", "monthly", "yearly"] as Period[]).map((p) => (
              <Button key={p}
                variant={period === p && !exactDate ? "default" : "outline"}
                size="sm"
                className="rounded-xl capitalize"
                style={period === p && !exactDate ? { background: "var(--gradient-primary)" } : {}}
                onClick={() => { setPeriod(p); setExactDate(null); }}>
                {p}
              </Button>
            ))}
            {/* Hidden native date input — triggered programmatically */}
            <input
              ref={dateInputRef}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
              onChange={(e) => { if (e.target.value) setExactDate(e.target.value); }}
            />
            <Button
              variant={exactDate ? "default" : "outline"}
              size="sm"
              className="rounded-xl gap-1.5"
              style={exactDate ? { background: "var(--gradient-primary)" } : {}}
              onClick={() => { try { (dateInputRef.current as any)?.showPicker?.(); } catch { dateInputRef.current?.click(); } }}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {exactDate ? formatExactDate(exactDate) : "Select Date"}
            </Button>
            {exactDate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-xl p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setExactDate(null)}
                title="Clear selected date"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Exact date banner */}
        {exactDate && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-2.5 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <span>Showing data for <strong>{formatExactDate(exactDate)}</strong></span>
            <button
              onClick={() => setExactDate(null)}
              className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}

        {/* Report tabs */}
        <div className="flex items-center gap-2 border-b pb-2">
          {([
            { key: "overview", icon: TrendingUp, label: "Overview" },
            { key: "products", icon: Package, label: "Products" },
            { key: "customers", icon: Users, label: "Customers" },
            { key: "payments", icon: CreditCard, label: "Payments" },
          ] as { key: Tab; icon: any; label: string }[]).map(({ key, icon: Icon, label }) => (
            <Button key={key} variant={tab === key ? "default" : "ghost"} size="sm" className="rounded-xl"
              style={tab === key ? { background: "var(--gradient-primary)" } : {}} onClick={() => setTab(key)}>
              <Icon className="mr-1.5 h-3.5 w-3.5" /> {label}
            </Button>
          ))}
          <div className="ml-auto flex gap-1.5">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={exportCSV}><Download className="mr-1 h-3.5 w-3.5" /> CSV</Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={exportExcel}><FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel</Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={exportPDF}><FileText className="mr-1 h-3.5 w-3.5" /> PDF</Button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : (
          <>
            {/* ─── OVERVIEW TAB ─── */}
            {tab === "overview" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatBox label="Revenue" value={formatINR(stats.revenue)} sub={`Today: ${formatINR(stats.todayRevenue)}`} />
                  <StatBox label="Orders" value={String(stats.orders)} sub={`Avg: ${formatINR(stats.avgOrder)}`} />
                  <StatBox label="Customers" value={String(stats.customers)} sub={`Repeat: ${stats.repeatCustomers}`} />
                  <StatBox label="Monthly Revenue" value={formatINR(stats.monthlyRevenue)} sub="Current month" />
                </div>

                <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
                  <div className="border-b p-5">
                    <h3 className="font-display text-base font-semibold">Revenue & Orders Trend</h3>
                  </div>
                  <div className="h-80 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false}
                          tickFormatter={(v) => v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                          formatter={(v: number, name: string) => [name === "revenue" ? formatINR(v) : v, name === "revenue" ? "Revenue" : "Orders"]} />
                        <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#revGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* Sales trend */}
                <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
                  <div className="border-b p-5"><h3 className="font-display text-base font-semibold">Orders Trend</h3></div>
                  <div className="h-64 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                        <Bar dataKey="orders" fill="var(--primary)" radius={[8, 8, 0, 0]} name="Orders" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* ── Payment Collection Summary ── */}
                <PaymentCollectionSummary summary={paymentSummary} period={exactDate ? formatExactDate(exactDate) : period} />
              </>
            )}

            {/* ─── PRODUCTS TAB ─── */}
            {tab === "products" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatBox label="Total Products Sold" value={String(topProducts.reduce((s, p) => s + p.qty, 0))} sub={`${topProducts.length} unique products`} />
                  <StatBox label="Product Revenue" value={formatINR(topProducts.reduce((s, p) => s + p.revenue, 0))} sub={`${period} period`} />
                  <StatBox label="Best Seller" value={topProducts[0]?.name ?? "—"} sub={topProducts[0] ? `${formatINR(topProducts[0].revenue)} · ${topProducts[0].qty} units` : ""} />
                </div>

                <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
                  <div className="border-b p-5"><h3 className="font-display text-base font-semibold">Product Revenue</h3></div>
                  <div className="h-72 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topProducts.slice(0, 10)} layout="vertical" margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false}
                          tickFormatter={(v) => v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} formatter={(v: number) => [formatINR(v), "Revenue"]} />
                        <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
                  <div className="border-b p-5"><h3 className="font-display text-base font-semibold">All Products — {period}</h3></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr><th className="px-5 py-3 text-left font-medium">#</th><th className="px-5 py-3 text-left font-medium">Product</th><th className="px-5 py-3 text-right font-medium">Revenue</th><th className="px-5 py-3 text-center font-medium">Units</th><th className="px-5 py-3 text-center font-medium">Orders</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-muted/30"><td className="px-5 py-3">{i + 1}</td><td className="px-5 py-3 font-medium">{p.name}</td><td className="px-5 py-3 text-right font-semibold tabular-nums">{formatINR(p.revenue)}</td><td className="px-5 py-3 text-center">{p.qty}</td><td className="px-5 py-3 text-center">{p.orders}</td></tr>
                        ))}
                        {topProducts.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No product data for this period.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {/* ─── CUSTOMERS TAB ─── */}
            {tab === "customers" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatBox label="Unique Customers" value={String(stats.customers)} sub={`${period} period`} />
                  <StatBox label="Repeat Customers" value={String(stats.repeatCustomers)} sub={stats.customers > 0 ? `${Math.round((stats.repeatCustomers / stats.customers) * 100)}% repeat rate` : "—"} />
                  <StatBox label="Top Spender" value={topCustomers[0]?.name ?? "—"} sub={topCustomers[0] ? `${formatINR(topCustomers[0].total)} · ${topCustomers[0].count} orders` : ""} />
                </div>

                <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
                  <div className="border-b p-5"><h3 className="font-display text-base font-semibold">All Customers — {period}</h3></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr><th className="px-5 py-3 text-left font-medium">#</th><th className="px-5 py-3 text-left font-medium">Customer</th><th className="px-5 py-3 text-left font-medium">Phone</th><th className="px-5 py-3 text-right font-medium">Total Spent</th><th className="px-5 py-3 text-center font-medium">Orders</th><th className="px-5 py-3 text-right font-medium">Avg Order</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {topCustomers.map((c, i) => (
                          <tr key={i} className="hover:bg-muted/30"><td className="px-5 py-3">{i + 1}</td><td className="px-5 py-3 font-medium">{c.name}</td><td className="px-5 py-3 text-muted-foreground tabular-nums">{c.phone}</td><td className="px-5 py-3 text-right font-semibold tabular-nums">{formatINR(c.total)}</td><td className="px-5 py-3 text-center">{c.count}</td><td className="px-5 py-3 text-right tabular-nums">{formatINR(c.avg)}</td></tr>
                        ))}
                        {topCustomers.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No customer data for this period.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {/* ─── PAYMENTS TAB ─── */}
            {tab === "payments" && (
              <>
                {/* Summary stat boxes */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {(() => {
                    const total = Object.values(paymentSummary).reduce((s, v) => s + v, 0);
                    const txnCount = paymentTxns.length;
                    const methodCount = Object.keys(paymentSummary).length;
                    const topMethod = Object.entries(paymentSummary).sort((a, b) => b[1] - a[1])[0];
                    return (
                      <>
                        <StatBox label="Total Collected" value={formatINR(total)} sub={`${period} period`} />
                        <StatBox label="Transactions" value={String(txnCount)} sub={txnCount > 0 ? `Avg: ${formatINR(Math.round(total / txnCount))}` : "—"} />
                        <StatBox label="Payment Methods" value={String(methodCount)} sub="active methods" />
                        <StatBox label="Top Method" value={topMethod?.[0] ?? "—"} sub={topMethod ? formatINR(topMethod[1]) : "—"} />
                      </>
                    );
                  })()}
                </div>

                {/* Payment Collection Summary cards + chart */}
                <PaymentCollectionSummary summary={paymentSummary} period={exactDate ? formatExactDate(exactDate) : period} />

                {/* All payment transactions table */}
                <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
                  <div className="border-b p-5">
                    <h3 className="font-display text-base font-semibold">All Payments — {period}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{paymentTxns.length} transactions</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3 text-left font-medium">#</th>
                          <th className="px-5 py-3 text-left font-medium">Invoice</th>
                          <th className="px-5 py-3 text-left font-medium">Customer</th>
                          <th className="px-5 py-3 text-left font-medium">Date</th>
                          <th className="px-5 py-3 text-left font-medium">Method</th>
                          <th className="px-5 py-3 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paymentTxns.map((t, i) => {
                          const displayMethod = t.method === "UPI" && t.upiAccount
                            ? `UPI (${t.upiAccount === "upi_1" ? "UPI 1" : t.upiAccount === "upi_2" ? "UPI 2" : "UPI 3"})`
                            : t.method;
                          const color = METHOD_COLORS[displayMethod] ?? METHOD_COLORS[t.method] ?? "#9ca3af";
                          return (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                              <td className="px-5 py-3 font-mono text-xs font-medium text-primary">{t.invoice}</td>
                              <td className="px-5 py-3 font-medium">{t.customer}</td>
                              <td className="px-5 py-3 text-muted-foreground tabular-nums">
                                {new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </td>
                              <td className="px-5 py-3">
                                <span
                                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                                  style={{ background: color + "22", color }}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                                  {displayMethod}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatINR(t.amount)}</td>
                            </tr>
                          );
                        })}
                        {paymentTxns.length === 0 && (
                          <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No payment records for this period.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5" style={{ boxShadow: "var(--shadow-elegant)" }}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display mt-2 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Payment Collection Summary ──────────────────────────────────────────────
const PAYMENT_METHOD_ORDER = ["Cash", "UPI 1", "UPI 2", "UPI 3", "Card", "Bank Transfer", "Other"];

const METHOD_COLORS: Record<string, string> = {
  "Cash":              "#22c55e",
  "UPI 1":             "#8B5E3C",
  "UPI 2":             "#a87d5a",
  "UPI 3":             "#c9a07d",
  "Card":              "#3b82f6",
  "Bank Transfer":     "#6366f1",
  "Other":             "#9ca3af",

};

function PaymentCollectionSummary({ summary, period }: { summary: Record<string, number>; period: string }) {
  const total = Object.values(summary).reduce((s, v) => s + v, 0);

  // Build ordered list — known methods first, then any extras
  const ordered = [
    ...PAYMENT_METHOD_ORDER.filter((m) => summary[m] !== undefined),
    ...Object.keys(summary).filter((m) => !PAYMENT_METHOD_ORDER.includes(m)),
  ];

  const chartData = ordered.map((m) => ({ name: m, amount: summary[m] ?? 0 }));

  return (
    <section className="overflow-hidden rounded-2xl border bg-card" style={{ boxShadow: "var(--shadow-elegant)" }}>
      <div className="border-b p-5 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">Payment Collection Summary</h3>
          <p className="mt-0.5 text-xs text-muted-foreground capitalize">
            {period} collection · Total: {formatINR(total)}
          </p>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">No payment data for this period.</p>
        </div>
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
            {ordered.map((method) => {
              const amt = summary[method] ?? 0;
              const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
              const color = METHOD_COLORS[method] ?? "#8B5E3C";
              return (
                <div
                  key={method}
                  className="relative overflow-hidden rounded-xl border bg-card p-4"
                  style={{ boxShadow: "var(--shadow-elegant)" }}
                >
                  {/* Accent bar */}
                  <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl" style={{ background: color }} />
                  <p className="pl-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{method}</p>
                  <p className="pl-2 mt-2 font-display text-xl font-bold tabular-nums">{formatINR(amt)}</p>
                  <p className="pl-2 mt-1 text-[11px] text-muted-foreground">{pct}% of total</p>
                </div>
              );
            })}
          </div>

          {/* Distribution Chart */}
          <div className="border-t px-5 pb-5 pt-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Distribution
            </p>
            <div className="space-y-2.5">
              {chartData.map(({ name, amount }) => {
                const pct = total > 0 ? (amount / total) * 100 : 0;
                const color = METHOD_COLORS[name] ?? "#8B5E3C";
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-right text-[11px] font-medium text-muted-foreground">{name}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-muted/50" style={{ height: 10 }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[11px] font-semibold tabular-nums">{formatINR(amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
