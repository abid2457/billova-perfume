// ─── Database Types ───
export type Customer = {
  id: string;
  customer_name: string;
  phone_number: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  ml: string;                    // "30 ml", "50 ml", "100 ml"
  variant_name: string | null;   // optional custom label
  selling_price: number;
  sku: string | null;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  product_name: string;
  category: string | null;
  selling_price: number;         // kept for backward compat; primary price now in variants
  description: string | null;
  created_at: string;
  // Joined
  product_variants?: ProductVariant[];
};

export type Category = {
  id: string;
  category_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string | null;
  product_name: string;
  variant_id: string | null;
  variant_label: string | null;  // e.g. "100 ml" — snapshot at purchase time
  quantity: number;
  unit_price: number;
  discount: number;              // kept for backward compat (old records); 0 for new bills
  total: number;                 // subtotal = qty × unit_price (no per-row discount anymore)
};

/** Mixed payment allocation row — one per payment method per purchase */
export type PurchasePayment = {
  id: string;
  purchase_id: string;
  payment_method: string;
  amount: number;
  created_at: string;
};

export type Purchase = {
  id: string;
  customer_id: string | null;
  billing_mode?: "customer" | "quick";  // "customer" (default) or "quick" for walk-in bills
  purchase_date: string;
  total_amount: number;           // grand total (subtotal − overall_discount)
  overall_discount?: number;      // invoice-level discount (0 for old records without migration)
  payment_method: string | null;  // "Cash", "UPI", etc. or "Mixed" for split payments
  upi_account?: string | null;
  notes: string | null;
  invoice_number: string;
  created_at: string;
  // Edit tracking
  is_edited?: boolean;
  edited_at?: string | null;
  edited_by?: string | null;
  // Joined fields
  customers?: { customer_name: string; phone_number: string } | null;
  purchase_items?: PurchaseItem[];
  purchase_payments?: PurchasePayment[];  // present when payment_method = "Mixed"
};

export type ReceiptLog = {
  id: string;
  purchase_id: string;
  invoice_number: string;
  action: "print" | "whatsapp" | "pdf";
  performed_at: string;
  performed_by: string | null;
};

// ─── Helpers ───
/** Subtotal before overall discount (sum of all item subtotals) */
export const purchaseSubtotal = (p: Purchase): number =>
  p.purchase_items?.reduce((s, i) => s + i.quantity * i.unit_price, 0) ?? p.total_amount;

/** Backward-compat alias — use total_amount (grand total) for revenue reporting */
export const purchaseTotal = (p: Purchase): number => p.total_amount;

export const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/** Display label for a purchase item — includes variant if present */
export const itemDisplayName = (item: PurchaseItem): string =>
  item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name;
