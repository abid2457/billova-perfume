/**
 * Public Invoice Page — /invoice/:invoiceNumber
 * ───────────────────────────────────────────────
 * No authentication required. Anyone with the receipt QR code can view this.
 * Fetches invoice data using invoice_number only (no internal IDs exposed).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Download, Printer, Share2, ShieldCheck, AlertCircle } from "lucide-react";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/invoice/$invoiceNumber")({
  head: ({ params }) => ({
    meta: [
      { title: `Invoice ${params.invoiceNumber} | Billova Perfumes` },
      { name: "description", content: `View invoice ${params.invoiceNumber} from Billova Perfumes.` },
      { name: "robots", content: "noindex, nofollow" }, // Prevent search engine indexing of private invoices
    ],
  }),
  component: PublicInvoicePage,
});

// ─── Store constants (duplicated from InvoiceService to avoid importing heavy deps) ──
const STORE = {
  name: "Hira Perfumes",
  tagline: "Exclusive Fragrances & Perfumes",
  phone: "+91 99940 33831",
  gst: "",
  address1: "215, Anna Salai Main Road",
  address2: "Near Niswan Street (Near Lassi Shop)",
  address3: "Melvisharam",
  address4: "Tamil Nadu - 632509",
};

function fmtINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Types ──
type InvoiceItem = {
  product_name: string;
  variant_label: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
};

type InvoiceData = {
  invoice_number: string;
  purchase_date: string;
  total_amount: number;
  overall_discount: number;
  payment_method: string | null;
  notes: string | null;
  customer_name: string;
  customer_phone: string;
  items: InvoiceItem[];
  payment_allocations: { payment_method: string; amount: number }[];
};

// ─── Component ──
function PublicInvoicePage() {
  const { invoiceNumber } = Route.useParams();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch purchase by invoice_number (no internal IDs)
        const { data: purchase, error: pErr } = await supabase
          .from("purchases")
          .select("invoice_number, purchase_date, total_amount, overall_discount, payment_method, notes, customer_id, customers(customer_name, phone_number)")
          .eq("invoice_number", invoiceNumber)
          .single();

        if (pErr || !purchase) {
          setError("not_found");
          setLoading(false);
          return;
        }

        // Fetch items using customer_id indirectly (we need purchase id)
        const { data: purchaseWithId } = await supabase
          .from("purchases")
          .select("id")
          .eq("invoice_number", invoiceNumber)
          .single();

        let items: InvoiceItem[] = [];
        if (purchaseWithId) {
          const { data: rawItems } = await supabase
            .from("purchase_items")
            .select("product_name, variant_label, quantity, unit_price, discount, total")
            .eq("purchase_id", purchaseWithId.id)
            .order("id", { ascending: true });
          items = (rawItems ?? []).map((r: any) => ({
            product_name: r.product_name,
            variant_label: r.variant_label,
            quantity: r.quantity,
            unit_price: r.unit_price,
            discount: r.discount ?? 0,
            total: r.total,
          }));
        }

        // Fetch payment allocations for mixed payments
        let paymentAllocations: { payment_method: string; amount: number }[] = [];
        if (purchase.payment_method === "Mixed" && purchaseWithId) {
          const { data: payData } = await supabase
            .from("purchase_payments")
            .select("payment_method, amount")
            .eq("purchase_id", purchaseWithId.id);
          paymentAllocations = (payData ?? []).map((p: any) => ({
            payment_method: p.payment_method,
            amount: p.amount,
          }));
        }

        const cust = purchase.customers as any;
        setInvoice({
          invoice_number: purchase.invoice_number,
          purchase_date: purchase.purchase_date,
          total_amount: purchase.total_amount,
          overall_discount: (purchase as any).overall_discount ?? 0,
          payment_method: purchase.payment_method,
          notes: purchase.notes,
          customer_name: cust?.customer_name ?? "Valued Customer",
          customer_phone: cust?.phone_number ?? "",
          items,
          payment_allocations: paymentAllocations,
        });
      } catch {
        setError("fetch_error");
      }
      setLoading(false);
    })();
  }, [invoiceNumber]);

  // ── Actions ──
  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    // Dynamically import to avoid bundling for non-auth pages
    const { generateInvoicePDF } = await import("@/lib/services/InvoiceService");
    const fullPurchase = {
      id: "", customer_id: "", created_at: "",
      invoice_number: invoice.invoice_number,
      purchase_date: invoice.purchase_date,
      total_amount: invoice.total_amount,
      payment_method: invoice.payment_method,
      notes: invoice.notes,
      customers: { customer_name: invoice.customer_name, phone_number: invoice.customer_phone },
      purchase_items: invoice.items.map((it) => ({
        id: "", purchase_id: "", product_id: null, variant_id: null,
        ...it,
      })),
      purchase_payments: invoice.payment_allocations.map((a) => ({
        id: "", purchase_id: "", created_at: "",
        ...a,
      })),
    };
    const blob = await generateInvoicePDF(fullPurchase as any);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoice_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!invoice) return;
    const url = window.location.href;
    const text = `Invoice ${invoice.invoice_number} from ${STORE.name} — ${fmtINR(invoice.total_amount)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Invoice ${invoice.invoice_number}`, text, url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      alert("Invoice link copied to clipboard!");
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="inv-page inv-center">
        <div className="inv-spinner" />
        <p style={{ marginTop: 16, color: "#6b7280", fontSize: 14 }}>Loading invoice...</p>
      </div>
    );
  }

  // ── Not Found ──
  if (error || !invoice) {
    return (
      <div className="inv-page inv-center">
        <AlertCircle size={48} color="#ef4444" />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 16, color: "#111827" }}>Invoice Not Found</h1>
        <p style={{ color: "#6b7280", maxWidth: 400, textAlign: "center", marginTop: 8, lineHeight: 1.6 }}>
          The invoice <strong>{invoiceNumber}</strong> could not be found.
          Please check the invoice number on your receipt and try again.
        </p>
        <a href="/" style={{ marginTop: 24, color: "#8B5E3C", fontWeight: 600, textDecoration: "none" }}>
          ← Go to Billova
        </a>
      </div>
    );
  }

  // ── Computed values ──
  const subtotalAll = invoice.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const overallDiscount = invoice.overall_discount ?? 0;
  const hasDiscount = overallDiscount > 0;

  // ── Invoice Page ──
  return (
    <>
      <style>{`
        /* ── Base ── */
        .inv-page {
          min-height: 100vh;
          background: #f3f0ec;
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          color: #111827;
        }
        .inv-center {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 100vh; padding: 24px;
        }
        .inv-spinner {
          width: 36px; height: 36px; border: 3px solid #e5e7eb;
          border-top-color: #8B5E3C; border-radius: 50%;
          animation: inv-spin 0.7s linear infinite;
        }
        @keyframes inv-spin { to { transform: rotate(360deg); } }

        /* ── Action Bar ── */
        .inv-actions {
          position: sticky; top: 0; z-index: 50;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(12px);
          border-bottom: 1px solid #e5e7eb;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 16px;
        }
        .inv-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
          border: 1px solid #d1d5db; background: #fff; color: #374151;
          cursor: pointer; transition: all 0.15s;
        }
        .inv-btn:hover { background: #f9fafb; border-color: #9ca3af; }
        .inv-btn-primary {
          background: #8B5E3C; color: #fff; border-color: #8B5E3C;
        }
        .inv-btn-primary:hover { background: #7a5235; }

        /* ── Card ── */
        .inv-card {
          max-width: 800px; margin: 24px auto; background: #fff;
          border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          overflow: hidden;
        }

        /* ── Header ── */
        .inv-header {
          background: linear-gradient(135deg, #8B5E3C 0%, #6b4226 100%);
          color: #fff; padding: 28px 32px; display: flex; align-items: center; gap: 20px;
        }
        .inv-logo {
          width: 80px; height: 80px; border-radius: 12px;
          background: rgba(255,255,255,0.15); padding: 6px;
          object-fit: contain; flex-shrink: 0;
        }
        .inv-store-name { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
        .inv-store-tag { font-size: 12px; opacity: 0.8; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px; }
        .inv-store-addr { font-size: 12px; opacity: 0.75; margin-top: 6px; line-height: 1.5; }
        .inv-store-phone { font-size: 12px; opacity: 0.85; margin-top: 2px; }

        /* ── Invoice Meta ── */
        .inv-meta {
          padding: 24px 32px; border-bottom: 1px solid #f0ebe6;
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px;
        }
        .inv-meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; font-weight: 600; }
        .inv-meta-value { font-size: 15px; font-weight: 600; color: #111827; margin-top: 2px; }
        .inv-meta-inv { color: #8B5E3C; font-size: 16px; font-weight: 700; }

        /* ── Bill To ── */
        .inv-billto {
          padding: 20px 32px; border-bottom: 1px solid #f0ebe6;
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px;
        }
        .inv-cust-name { font-size: 18px; font-weight: 700; }
        .inv-cust-phone { font-size: 13px; color: #6b7280; margin-top: 2px; }

        /* ── Table ── */
        .inv-table-wrap { padding: 0 32px 24px; overflow-x: auto; }
        .inv-table {
          width: 100%; border-collapse: collapse; margin-top: 16px;
          font-size: 13px;
        }
        .inv-table th {
          background: #faf6f2; color: #8B5E3C; font-weight: 700;
          padding: 10px 12px; text-align: left; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.5px;
          border-bottom: 2px solid #e8ddd4;
        }
        .inv-table th:nth-child(n+3) { text-align: right; }
        .inv-table td {
          padding: 10px 12px; border-bottom: 1px solid #f0ebe6;
          vertical-align: top;
        }
        .inv-table td:nth-child(n+3) { text-align: right; font-variant-numeric: tabular-nums; }
        .inv-table tr:last-child td { border-bottom: none; }
        .inv-prod-name { font-weight: 600; }
        .inv-variant { font-size: 11px; color: #9ca3af; margin-top: 1px; }
        .inv-discount-cell { color: #dc2626; }

        /* ── Totals ── */
        .inv-totals {
          margin: 0 32px 24px; border-top: 2px solid #e8ddd4;
          padding-top: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
        }
        .inv-total-row {
          display: flex; justify-content: space-between; width: 260px; font-size: 14px;
        }
        .inv-total-row.grand {
          font-size: 20px; font-weight: 800; color: #8B5E3C;
          border-top: 2px solid #8B5E3C; padding-top: 10px; margin-top: 4px;
        }

        /* ── Footer ── */
        .inv-footer {
          padding: 24px 32px; background: #faf8f6; border-top: 1px solid #f0ebe6;
          text-align: center;
        }
        .inv-verified {
          display: inline-flex; align-items: center; gap: 6px;
          background: #ecfdf5; color: #059669; padding: 6px 14px;
          border-radius: 20px; font-size: 12px; font-weight: 700;
          border: 1px solid #a7f3d0;
        }
        .inv-footer-text { font-size: 12px; color: #9ca3af; margin-top: 10px; }
        .inv-thanks {
          font-size: 16px; font-weight: 700; color: #8B5E3C;
          margin-top: 16px;
        }

        /* ── Print-specific ── */
        @media print {
          .inv-actions { display: none !important; }
          .inv-page { background: #fff !important; }
          .inv-card { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        /* ── Responsive ── */
        @media (max-width: 640px) {
          .inv-header { flex-direction: column; text-align: center; padding: 20px 16px; }
          .inv-meta { flex-direction: column; padding: 16px; }
          .inv-billto { flex-direction: column; padding: 16px; }
          .inv-table-wrap { padding: 0 12px 16px; }
          .inv-table { font-size: 12px; }
          .inv-table th, .inv-table td { padding: 8px 6px; }
          .inv-totals { margin: 0 12px 16px; }
          .inv-total-row { width: 100%; }
          .inv-card { margin: 12px; border-radius: 12px; }
          .inv-footer { padding: 16px; }
          .inv-store-name { font-size: 18px; }
        }
      `}</style>

      <div className="inv-page">
        {/* ── Sticky Action Bar ── */}
        <div className="inv-actions">
          <button className="inv-btn inv-btn-primary" onClick={handleDownloadPDF}>
            <Download size={15} /> Download PDF
          </button>
          <button className="inv-btn" onClick={handlePrint}>
            <Printer size={15} /> Print
          </button>
          <button className="inv-btn" onClick={handleShare}>
            <Share2 size={15} /> Share
          </button>
        </div>

        {/* ── Invoice Card ── */}
        <div className="inv-card" ref={invoiceRef}>

          {/* Header */}
          <div className="inv-header">
            <img src={logoUrl} alt="Billova Logo" className="inv-logo" />
            <div>
              <div className="inv-store-name">{STORE.name}</div>
              <div className="inv-store-tag">{STORE.tagline}</div>
              <div className="inv-store-addr">
                {STORE.address1}, {STORE.address2}<br />
                {STORE.address3}, {STORE.address4}
              </div>
              <div className="inv-store-phone">Phone: {STORE.phone}</div>
            </div>
          </div>

          {/* Invoice Meta */}
          <div className="inv-meta">
            <div>
              <div className="inv-meta-label">Invoice Number</div>
              <div className="inv-meta-value inv-meta-inv">{invoice.invoice_number}</div>
            </div>
            <div>
              <div className="inv-meta-label">Date</div>
              <div className="inv-meta-value">{fmtDate(invoice.purchase_date)}</div>
            </div>
            <div>
              <div className="inv-meta-label">Time</div>
              <div className="inv-meta-value">{fmtTime(invoice.purchase_date)}</div>
            </div>
            <div>
              <div className="inv-meta-label">Payment</div>
              <div className="inv-meta-value">{invoice.payment_method === "Mixed" ? "Mixed Payment" : (invoice.payment_method ?? "Cash")}</div>
              {invoice.payment_method === "Mixed" && invoice.payment_allocations.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                  {invoice.payment_allocations.map((a, i) => (
                    <div key={i}>{a.payment_method}: {fmtINR(a.amount)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bill To */}
          <div className="inv-billto">
            <div>
              <div className="inv-meta-label">Bill To</div>
              <div className="inv-cust-name">{invoice.customer_name}</div>
              {invoice.customer_phone && <div className="inv-cust-phone">Phone: {invoice.customer_phone}</div>}
            </div>
            {STORE.gst && (
              <div>
                <div className="inv-meta-label">GST Number</div>
                <div className="inv-meta-value">{STORE.gst}</div>
              </div>
            )}
          </div>

          {/* Items Table — no per-item discount column */}
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ color: "#9ca3af", fontWeight: 500 }}>{i + 1}</td>
                    <td>
                      <div className="inv-prod-name">{item.product_name}</div>
                      {item.variant_label && <div className="inv-variant">{item.variant_label}</div>}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{fmtINR(item.unit_price)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtINR(item.quantity * item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="inv-totals">
            {hasDiscount && (
              <>
                <div className="inv-total-row">
                  <span style={{ color: "#6b7280" }}>Subtotal</span>
                  <span>{fmtINR(subtotalAll)}</span>
                </div>
                <div className="inv-total-row">
                  <span style={{ color: "#dc2626" }}>Overall Discount</span>
                  <span style={{ color: "#dc2626" }}>-{fmtINR(overallDiscount)}</span>
                </div>
              </>
            )}
            <div className="inv-total-row grand">
              <span>Grand Total</span>
              <span>{fmtINR(invoice.total_amount)}</span>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div style={{ padding: "0 32px 16px", fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>
              Note: {invoice.notes}
            </div>
          )}

          {/* Footer */}
          <div className="inv-footer">
            <div className="inv-verified">
              <ShieldCheck size={14} /> Verified Invoice
            </div>
            <div className="inv-footer-text">
              Generated by Billova Purchase Tracker
            </div>
            <div className="inv-thanks">Thank You for Shopping with Us!</div>
            <div className="inv-footer-text" style={{ marginTop: 12 }}>
              {STORE.name} — {STORE.address3}, {STORE.address4}<br />
              Phone: {STORE.phone}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
