import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Search, LogOut, User, Lock, X, Check, Trash2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useNotifications, type Notification } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

// ─── GLOBAL SEARCH ───
type SearchResult = { type: "customer" | "product" | "purchase"; id: string; title: string; subtitle: string };

function useGlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (term: string) => {
    if (term.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const s = `%${term}%`;
      const [cust, prod, purch] = await Promise.all([
        supabase.from("customers").select("id, customer_name, phone_number").or(`customer_name.ilike.${s},phone_number.ilike.${s}`).limit(5),
        supabase.from("products").select("id, product_name, category, selling_price").ilike("product_name", s).limit(5),
        supabase.from("purchases").select("id, total_amount, purchase_date, customers(customer_name, phone_number)").limit(5),
      ]);

      const r: SearchResult[] = [];
      (cust.data ?? []).forEach((c: any) => r.push({ type: "customer", id: c.id, title: c.customer_name, subtitle: c.phone_number }));
      (prod.data ?? []).forEach((p: any) => r.push({ type: "product", id: p.id, title: p.product_name, subtitle: `₹${p.selling_price} · ${p.category ?? "Uncategorized"}` }));
      // Filter purchases client-side by customer name/phone
      (purch.data ?? []).filter((p: any) =>
        p.customers?.customer_name?.toLowerCase().includes(term.toLowerCase()) ||
        p.customers?.phone_number?.includes(term)
      ).slice(0, 3).forEach((p: any) =>
        r.push({ type: "purchase", id: p.id, title: `Purchase ₹${p.total_amount}`, subtitle: `${p.customers?.customer_name ?? "Unknown"} · ${new Date(p.purchase_date).toLocaleDateString("en-IN")}` })
      );
      setResults(r);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  const onChange = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 300);
  };

  return { q, setQ: onChange, results, loading, clear: () => { setQ(""); setResults([]); } };
}

export function AppHeader({ title }: { title: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { q, setQ, results, loading, clear } = useGlobalSearch();
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "HP";
  const lastLogin = user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("en-IN") : "—";

  const goToResult = (r: SearchResult) => {
    clear();
    setSearchOpen(false);
    if (r.type === "customer") navigate({ to: "/history", search: { phone: r.subtitle } });
    else if (r.type === "product") navigate({ to: "/products" });
    else navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <SidebarTrigger className="-ml-1" />
      <div className="hidden h-6 w-px bg-border sm:block" />
      <h1 className="font-display truncate text-base font-semibold sm:text-lg">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* ─── GLOBAL SEARCH ─── */}
        <div ref={searchRef} className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)} placeholder="Search…" className="h-9 w-64 rounded-xl pl-9 pr-8" />
          {q && <button onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}

          {searchOpen && (q.length >= 2) && (
            <div className="absolute right-0 top-full mt-1.5 w-80 overflow-hidden rounded-xl border bg-card shadow-lg" style={{ boxShadow: "var(--shadow-lift)" }}>
              {loading && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</div>}
              {!loading && results.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results for "{q}"</div>}
              {!loading && results.length > 0 && (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {results.map((r, i) => (
                    <li key={i}>
                      <button onClick={() => goToResult(r)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                          {r.type === "customer" ? "C" : r.type === "product" ? "P" : "₹"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ─── NOTIFICATIONS ─── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative rounded-xl">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-xl">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <div className="flex gap-1">
                {unreadCount > 0 && <Button variant="ghost" size="sm" className="h-6 rounded-md px-2 text-[10px]" onClick={markAllRead}><Check className="mr-1 h-3 w-3" /> Read all</Button>}
                {notifications.length > 0 && <Button variant="ghost" size="sm" className="h-6 rounded-md px-2 text-[10px] text-destructive" onClick={clearAll}><Trash2 className="mr-1 h-3 w-3" /> Clear</Button>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <DropdownMenuItem key={n.id} className={`flex flex-col items-start gap-0.5 px-4 py-2.5 ${!n.read ? "bg-accent/50" : ""}`}
                    onClick={() => markRead(n.id)}>
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{n.message}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(n.time)}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ─── PROFILE MENU ─── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="h-9 w-9 cursor-pointer ring-2 ring-border transition-shadow hover:ring-primary/50">
              <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl">
            <DropdownMenuLabel className="pb-0">
              <p className="font-medium">{user?.email ?? "User"}</p>
              <p className="text-[10px] font-normal text-muted-foreground">Last login: {lastLogin}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })} className="gap-2"><User className="h-4 w-4" /> Profile & Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })} className="gap-2"><Lock className="h-4 w-4" /> Change Password</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive"><LogOut className="h-4 w-4" /> Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}