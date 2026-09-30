import { supabase } from "./supabase";
import type { Customer, Product, ProductVariant, Purchase, PurchaseItem, Category } from "./types";

// ─── CUSTOMERS ───
export async function fetchCustomers(search?: string): Promise<Customer[]> {
  let q = supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (search) q = q.or(`customer_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCustomerByPhone(phone: string): Promise<Customer | null> {
  const { data } = await supabase.from("customers").select("*").eq("phone_number", phone).maybeSingle();
  return data;
}

export async function searchCustomers(term: string): Promise<Customer[]> {
  const s = `%${term}%`;
  const { data } = await supabase.from("customers").select("*")
    .or(`phone_number.ilike.${s},customer_name.ilike.${s}`).limit(8);
  return data ?? [];
}

export async function createCustomer(c: Omit<Customer, "id" | "created_at">) {
  const { data, error } = await supabase.from("customers").insert(c).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(id: string, c: Partial<Customer>) {
  const { error } = await supabase.from("customers").update(c).eq("id", id);
  if (error) throw error;
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

// ─── CATEGORIES ───
export async function fetchCategoryList(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("category_name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchCategories(): Promise<string[]> {
  const { data } = await supabase.from("categories").select("category_name").order("category_name");
  return (data ?? []).map((d: { category_name: string }) => d.category_name);
}

export async function createCategory(c: { category_name: string; description?: string | null }) {
  const { data, error } = await supabase.from("categories").insert({
    category_name: c.category_name.trim(),
    description: c.description?.trim() || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, c: { category_name?: string; description?: string | null }) {
  const { error } = await supabase.from("categories").update({
    ...c,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function getCategoryProductCount(categoryName: string): Promise<number> {
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category", categoryName);
  return count ?? 0;
}

// ─── PRODUCTS ───
export async function fetchProducts(search?: string): Promise<Product[]> {
  // Try to join product_variants — falls back gracefully if migration hasn't run yet
  try {
    let q = supabase
      .from("products")
      .select("*, product_variants(*)")
      .order("created_at", { ascending: false });
    if (search) q = q.or(`product_name.ilike.%${search}%,category.ilike.%${search}%`);
    const { data, error } = await q;
    // If product_variants table doesn't exist yet, fall back to simple fetch
    if (error) {
      console.warn("[fetchProducts] variant join failed, falling back:", error.message);
      return fetchProductsSimple(search);
    }
    return (data ?? []) as Product[];
  } catch {
    return fetchProductsSimple(search);
  }
}

export async function fetchProductsSimple(search?: string): Promise<Product[]> {
  let q = supabase.from("products").select("*").order("created_at", { ascending: false });
  if (search) q = q.or(`product_name.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createProduct(p: Omit<Product, "id" | "created_at" | "product_variants">) {
  const { data, error } = await supabase.from("products").insert({
    product_name: p.product_name,
    category: p.category,
    selling_price: p.selling_price,
    description: p.description,
  }).select().single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, p: Partial<Omit<Product, "product_variants">>) {
  const { error } = await supabase.from("products").update(p).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// ─── PRODUCT VARIANTS ───
export async function fetchVariantsByProduct(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("selling_price", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createVariant(v: {
  product_id: string;
  ml: string;
  selling_price: number;
  variant_name?: string | null;
  sku?: string | null;
  barcode?: string | null;
}): Promise<ProductVariant> {
  const { data, error } = await supabase
    .from("product_variants")
    .insert({
      product_id: v.product_id,
      ml: v.ml.trim(),
      selling_price: v.selling_price,
      variant_name: v.variant_name?.trim() || null,
      sku: v.sku?.trim() || null,
      barcode: v.barcode?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProductVariant;
}

export async function updateVariant(id: string, v: Partial<Pick<ProductVariant, "ml" | "selling_price" | "variant_name" | "sku" | "barcode" | "is_active">>) {
  const { error } = await supabase
    .from("product_variants")
    .update({ ...v, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteVariant(id: string) {
  const { error } = await supabase.from("product_variants").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertVariants(
  productId: string,
  variants: { id?: string | null; ml: string; selling_price: number }[]
): Promise<void> {
  // ── 1. Separate existing (have a valid id) vs new (no id) ──
  const existing = variants.filter((v) => v.id && typeof v.id === "string" && v.id.length > 0);
  const newOnes  = variants.filter((v) => !v.id || typeof v.id !== "string" || v.id.length === 0);
  const keepIds  = existing.map((v) => v.id!);

  // ── 2. Delete variants that the user removed ──
  // Only delete rows belonging to this product that are NOT in keepIds
  if (keepIds.length > 0) {
    const { error: delErr } = await supabase
      .from("product_variants")
      .delete()
      .eq("product_id", productId)
      .not("id", "in", `(${keepIds.join(",")})`);
    if (delErr) throw delErr;
  } else {
    // User removed ALL old variants — delete them all
    const { error: delErr } = await supabase
      .from("product_variants")
      .delete()
      .eq("product_id", productId);
    if (delErr) throw delErr;
  }

  // ── 3. UPDATE existing variants one-by-one (never send null id) ──
  for (const v of existing) {
    const { error } = await supabase
      .from("product_variants")
      .update({
        ml: v.ml.trim(),
        selling_price: v.selling_price,
        updated_at: new Date().toISOString(),
      })
      .eq("id", v.id!);
    if (error) throw error;
  }

  // ── 4. INSERT new variants (let DB generate UUID) ──
  if (newOnes.length > 0) {
    const insertRows = newOnes.map((v) => ({
      product_id: productId,
      ml: v.ml.trim(),
      selling_price: v.selling_price,
    }));
    const { error } = await supabase
      .from("product_variants")
      .insert(insertRows);
    if (error) throw error;
  }
}

// ─── PURCHASES ───
export async function fetchPurchases(opts?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Purchase[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  let q = supabase
    .from("purchases")
    .select("*, purchase_items(*), purchase_payments(*), customers(customer_name, phone_number)")
    .order("purchase_date", { ascending: false })
    .range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  let results = (data ?? []) as Purchase[];
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    results = results.filter(
      (p) =>
        p.customers?.customer_name?.toLowerCase().includes(s) ||
        p.customers?.phone_number?.includes(s)
    );
  }
  return results;
}

export async function fetchPurchasesByCustomerId(customerId: string): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select("*, purchase_items(*), purchase_payments(*), customers(customer_name, phone_number)")
    .eq("customer_id", customerId)
    .order("purchase_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Purchase[];
}

export async function fetchPurchasesByPhone(phone: string): Promise<Purchase[]> {
  const customer = await fetchCustomerByPhone(phone);
  if (!customer) return [];
  return fetchPurchasesByCustomerId(customer.id);
}

// ─── INVOICE NUMBER GENERATION ───
async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const prefix = `AH-${dateStr}-`;

  const { data } = await supabase
    .from("purchases")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const lastNum = data[0].invoice_number;
    const lastSeq = parseInt(lastNum.split("-").pop() ?? "0", 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createPurchase(purchase: {
  customer_id: string | null;
  billing_mode?: "customer" | "quick";
  purchase_date: string;
  total_amount: number;
  overall_discount?: number;   // invoice-level discount (new billing model)
  payment_method?: string;
  notes?: string;
  items: {
    product_id?: string;
    product_name: string;
    variant_id?: string;
    variant_label?: string;
    quantity: number;
    unit_price: number;
    discount?: number;
    total: number;
  }[];
  /** Mixed payment allocations — only present when payment_method = "Mixed" */
  payment_allocations?: { payment_method: string; amount: number }[];
  /** UPI account selection — only present when payment_method = "UPI" (internal tracking only) */
  upi_account?: string;
}) {
  const invoiceNumber = await generateInvoiceNumber();

  const { data: pData, error: pErr } = await supabase
    .from("purchases")
    .insert({
      customer_id: purchase.customer_id,
      billing_mode: purchase.billing_mode ?? (purchase.customer_id ? "customer" : "quick"),
      purchase_date: purchase.purchase_date,
      total_amount: purchase.total_amount,
      overall_discount: purchase.overall_discount ?? 0,
      payment_method: purchase.payment_method ?? null,
      notes: purchase.notes ?? null,
      invoice_number: invoiceNumber,
      upi_account: purchase.upi_account ?? null,
    })
    .select()
    .single();
  if (pErr) throw pErr;

  const items = purchase.items.map((i) => ({
    purchase_id: pData.id,
    product_id: i.product_id ?? null,
    product_name: i.product_name,
    variant_id: i.variant_id ?? null,
    variant_label: i.variant_label ?? null,
    quantity: i.quantity,
    unit_price: i.unit_price,
    discount: i.discount ?? 0,
    total: i.total,
  }));
  const { error: iErr } = await supabase.from("purchase_items").insert(items);
  if (iErr) throw iErr;

  // Insert mixed payment allocations if present
  if (purchase.payment_allocations && purchase.payment_allocations.length > 0) {
    const payRows = purchase.payment_allocations
      .filter((a) => a.amount > 0)
      .map((a) => ({
        purchase_id: pData.id,
        payment_method: a.payment_method,
        amount: a.amount,
      }));
    if (payRows.length > 0) {
      const { error: payErr } = await supabase.from("purchase_payments").insert(payRows);
      if (payErr) throw payErr;
    }
  }

  return { ...pData, invoice_number: invoiceNumber };
}

// ─── QUICK BILLS ───
export async function fetchQuickBills(opts?: {
  search?: string;
}): Promise<Purchase[]> {
  // Quick bills: billing_mode = 'quick' OR (legacy) customer_id IS NULL
  let q = supabase
    .from("purchases")
    .select("*, purchase_items(*), purchase_payments(*)")
    .or("billing_mode.eq.quick,customer_id.is.null")
    .order("purchase_date", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  let results = (data ?? []) as Purchase[];
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    results = results.filter(
      (p) =>
        p.invoice_number?.toLowerCase().includes(s) ||
        p.purchase_items?.some((i) => i.product_name.toLowerCase().includes(s)) ||
        p.purchase_date?.includes(s)
    );
  }
  return results;
}

export async function deletePurchase(id: string) {
  await supabase.from("purchase_payments").delete().eq("purchase_id", id);
  await supabase.from("purchase_items").delete().eq("purchase_id", id);
  const { error } = await supabase.from("purchases").delete().eq("id", id);
  if (error) throw error;
}

// ─── RECEIPT LOGGING ───
export async function logReceiptAction(purchaseId: string, invoiceNumber: string, action: "print" | "whatsapp" | "pdf") {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("receipt_logs").insert({
    purchase_id: purchaseId,
    invoice_number: invoiceNumber,
    action,
    performed_by: user?.id ?? null,
  });
}

export async function fetchReceiptLogs(purchaseId: string) {
  const { data } = await supabase
    .from("receipt_logs")
    .select("*")
    .eq("purchase_id", purchaseId)
    .order("performed_at", { ascending: false });
  return (data ?? []) as { id: string; action: string; performed_at: string }[];
}

export async function fetchReceiptStats(purchaseIds: string[]): Promise<Map<string, { printCount: number; whatsappCount: number; lastPrinted: string | null; lastWhatsapp: string | null }>> {
  const result = new Map<string, { printCount: number; whatsappCount: number; lastPrinted: string | null; lastWhatsapp: string | null }>();
  if (purchaseIds.length === 0) return result;

  const { data } = await supabase
    .from("receipt_logs")
    .select("purchase_id, action, performed_at")
    .in("purchase_id", purchaseIds)
    .order("performed_at", { ascending: false });

  for (const log of data ?? []) {
    const existing = result.get(log.purchase_id) ?? { printCount: 0, whatsappCount: 0, lastPrinted: null, lastWhatsapp: null };
    if (log.action === "print") {
      existing.printCount++;
      if (!existing.lastPrinted) existing.lastPrinted = log.performed_at;
    } else if (log.action === "whatsapp") {
      existing.whatsappCount++;
      if (!existing.lastWhatsapp) existing.lastWhatsapp = log.performed_at;
    }
    result.set(log.purchase_id, existing);
  }
  return result;
}

export async function fetchPurchaseByInvoice(invoiceNumber: string): Promise<Purchase | null> {
  const { data } = await supabase
    .from("purchases")
    .select("*, purchase_items(*), purchase_payments(*), customers(customer_name, phone_number)")
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();
  return data as Purchase | null;
}

// ─── DASHBOARD STATS (single source of truth) ───
export async function fetchDashboardStats() {
  const now = new Date();
  const todayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [allPurchasesRes, custRes, itemsRes] = await Promise.all([
    supabase.from("purchases").select("total_amount, purchase_date"),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("purchase_items").select("quantity"),
  ]);

  const allPurchases = (allPurchasesRes.data ?? []) as { total_amount: number; purchase_date: string }[];

  let totalRevenue = 0;
  let todayRevenue = 0;
  let monthlyRevenue = 0;
  let todayCount = 0;
  let monthCount = 0;

  for (const p of allPurchases) {
    totalRevenue += p.total_amount;
    if (p.purchase_date >= todayISO) {
      todayRevenue += p.total_amount;
      todayCount++;
    }
    if (p.purchase_date >= monthISO) {
      monthlyRevenue += p.total_amount;
      monthCount++;
    }
  }

  const totalPurchases = allPurchases.length;
  const totalCustomers = custRes.count ?? 0;
  const totalProductsSold = (itemsRes.data ?? []).reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0);

  return {
    totalRevenue,
    todayRevenue,
    monthlyRevenue,
    totalCustomers,
    totalPurchases,
    totalProductsSold,
    thisMonth: monthCount,
    today: todayCount,
    avgOrder: totalPurchases > 0 ? Math.round(totalRevenue / totalPurchases) : 0,
    revenuePerCustomer: totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0,
  };
}

/** Aggregate payment method totals for today and this month */
export async function fetchPaymentAnalytics() {
  const now = new Date();
  const todayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Fetch all purchases with their payments
  const { data: purchases } = await supabase
    .from("purchases")
    .select("total_amount, purchase_date, payment_method, purchase_payments(payment_method, amount)")
    .gte("purchase_date", monthISO);

  const methods = ["Cash", "UPI", "Card", "Bank Transfer"] as const;
  const today: Record<string, number> = Object.fromEntries(methods.map((m) => [m, 0]));
  const month: Record<string, number> = Object.fromEntries(methods.map((m) => [m, 0]));

  for (const p of (purchases ?? []) as any[]) {
    const isToday = p.purchase_date >= todayISO;
    if (p.payment_method === "Mixed" && p.purchase_payments?.length > 0) {
      // Use breakdown from purchase_payments table
      for (const pp of p.purchase_payments) {
        if (month[pp.payment_method] !== undefined) month[pp.payment_method] += Number(pp.amount);
        if (isToday && today[pp.payment_method] !== undefined) today[pp.payment_method] += Number(pp.amount);
      }
    } else if (p.payment_method && methods.includes(p.payment_method as any)) {
      // Single payment method — attribute full amount
      month[p.payment_method] += Number(p.total_amount);
      if (isToday) today[p.payment_method] += Number(p.total_amount);
    }
  }

  return { today, month };
}

export async function fetchRevenueTrend(weeks = 12) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - weeks * 7);
  start.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("purchases")
    .select("total_amount, purchase_date")
    .gte("purchase_date", start.toISOString())
    .order("purchase_date", { ascending: true });

  const list = (data ?? []) as { total_amount: number; purchase_date: string }[];
  const buckets: { label: string; revenue: number; orders: number }[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);
    const bStart = new Date(end);
    bStart.setDate(bStart.getDate() - 6);
    bStart.setHours(0, 0, 0, 0);

    const startISO = bStart.toISOString();
    const endISO = end.toISOString();

    let revenue = 0, orders = 0;
    for (const p of list) {
      if (p.purchase_date >= startISO && p.purchase_date <= endISO) {
        revenue += p.total_amount;
        orders++;
      }
    }
    buckets.push({
      label: bStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      revenue,
      orders,
    });
  }
  return buckets;
}

export async function fetchTopProducts(limit = 5) {
  const { data } = await supabase.from("purchase_items").select("product_name, quantity, total");
  const map = new Map<string, { revenue: number; qty: number }>();
  for (const i of data ?? []) {
    const cur = map.get(i.product_name) ?? { revenue: 0, qty: 0 };
    cur.revenue += i.total;
    cur.qty += i.quantity;
    map.set(i.product_name, cur);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name: name.length > 22 ? name.slice(0, 21) + "…" : name, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function fetchTopCustomers(limit = 5) {
  const { data } = await supabase.from("purchases").select("customer_id, total_amount, customers(customer_name)");
  const map = new Map<string, { name: string; total: number }>();
  for (const p of data ?? []) {
    if (!(p as any).customer_id) continue; // Skip Quick Bill (walk-in) purchases
    const cur = map.get((p as any).customer_id) ?? { name: (p as any).customers?.customer_name ?? "Unknown", total: 0 };
    cur.total += (p as any).total_amount;
    map.set((p as any).customer_id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, limit);
}

// ─── CUSTOMER STATS ───
export async function fetchCustomerStats(phone: string) {
  const customer = await fetchCustomerByPhone(phone);
  if (!customer) return null;

  const { data: purchases } = await supabase
    .from("purchases")
    .select("purchase_date, total_amount")
    .eq("customer_id", customer.id)
    .order("purchase_date", { ascending: true });

  const list = purchases ?? [];
  const total = list.reduce((s: number, p: { total_amount: number }) => s + p.total_amount, 0);

  return {
    name: customer.customer_name,
    phone: customer.phone_number,
    count: list.length,
    total,
    avg: list.length > 0 ? Math.round(total / list.length) : 0,
    first: list.length ? list[0].purchase_date : null,
    last: list.length ? list[list.length - 1].purchase_date : null,
  };
}

// ─── RECENT CUSTOMERS ───
export async function fetchRecentCustomers(limit = 6) {
  const { data: purchases } = await supabase.from("purchases")
    .select("customer_id, total_amount, purchase_date, customers(customer_name, phone_number)")
    .order("purchase_date", { ascending: false });

  const map = new Map<string, { name: string; phone: string; total: number; count: number; last: string }>();
  for (const p of (purchases ?? []) as any[]) {
    if (!p.customer_id) continue; // Skip Quick Bill (walk-in) purchases
    if (map.has(p.customer_id)) {
      const cur = map.get(p.customer_id)!;
      cur.total += p.total_amount;
      cur.count++;
    } else {
      map.set(p.customer_id, {
        name: p.customers?.customer_name ?? "Unknown",
        phone: p.customers?.phone_number ?? "",
        total: p.total_amount,
        count: 1,
        last: p.purchase_date,
      });
    }
  }
  return Array.from(map.values()).slice(0, limit);
}

// ─── ADMIN / SETTINGS ───────────────────────────────────────────────────────

/** Calls a Postgres SECURITY DEFINER function — passcode never leaves the DB */
export async function verifyAdminPasscode(code: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("verify_admin_passcode", { input_passcode: code });
    if (error) { console.error("[verifyAdminPasscode]", error.message); return false; }
    return data === true;
  } catch { return false; }
}

// ─── UPDATE PURCHASE ─────────────────────────────────────────────────────────

export async function updatePurchase(
  id: string,
  payload: {
    customer_id?: string | null;
    total_amount: number;
    overall_discount: number;
    payment_method: string | null;
    notes: string | null;
    upi_account?: string | null;
    items: {
      product_id?: string;
      product_name: string;
      variant_id?: string;
      variant_label?: string;
      quantity: number;
      unit_price: number;
      discount?: number;
      total: number;
    }[];
    payment_allocations?: { payment_method: string; amount: number }[];
  }
): Promise<void> {
  // 1. Update main purchase record
  const { error: pErr } = await supabase.from("purchases").update({
    customer_id: payload.customer_id,
    total_amount: payload.total_amount,
    overall_discount: payload.overall_discount,
    payment_method: payload.payment_method,
    notes: payload.notes,
    upi_account: payload.upi_account ?? null,
    is_edited: true,
    edited_at: new Date().toISOString(),
    edited_by: "admin",
  }).eq("id", id);
  if (pErr) throw pErr;

  // 2. Replace purchase items
  const { error: delI } = await supabase.from("purchase_items").delete().eq("purchase_id", id);
  if (delI) throw delI;
  if (payload.items.length > 0) {
    const { error: insI } = await supabase.from("purchase_items").insert(
      payload.items.map((i) => ({
        purchase_id: id,
        product_id: i.product_id ?? null,
        product_name: i.product_name,
        variant_id: i.variant_id ?? null,
        variant_label: i.variant_label ?? null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount ?? 0,
        total: i.total,
      }))
    );
    if (insI) throw insI;
  }

  // 3. Replace payment allocations
  await supabase.from("purchase_payments").delete().eq("purchase_id", id);
  if (payload.payment_allocations && payload.payment_allocations.length > 0) {
    const { error: insP } = await supabase.from("purchase_payments").insert(
      payload.payment_allocations.map((a) => ({
        purchase_id: id,
        payment_method: a.payment_method,
        amount: a.amount,
      }))
    );
    if (insP) throw insP;
  }
}

// ─── EDIT AUDIT LOG ──────────────────────────────────────────────────────────

export async function createEditLog(purchaseId: string, changesSummary: string): Promise<void> {
  await supabase.from("purchase_edit_logs").insert({
    purchase_id: purchaseId,
    edited_by: "admin",
    changes_summary: changesSummary,
  });
}
