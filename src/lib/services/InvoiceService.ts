/**
 * InvoiceService
 * Single responsibility: generate invoice documents (PDF + PNG + Thermal).
 * No upload, no WhatsApp, no side effects.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { Purchase } from "@/lib/types";
import logoUrl from "@/assets/logo.png";

// ─── STORE CONSTANTS ────────────────────────────────────────────────────────
export const STORE = {
  name: "Billova Perfumes",
  phone: "+91 8098755101",
  gst: "", // GST placeholder — populate when registered
  address1: "172/76 First West Main Road",
  address2: "Behind Silk Mill Bus Stop",
  address3: "Gandhi Nagar",
  address4: "Vellore - 632006",
  addressOneLine:
    "172/76 First West Main Road, Behind Silk Mill Bus Stop, Gandhi Nagar, Vellore - 632006",
  brandColor: [139, 94, 60] as [number, number, number],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
export function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function fmtINR(n: number): string {
  return "Rs." + n.toLocaleString("en-IN");
}

// ─── LOGO CACHE ──────────────────────────────────────────────────────────────
let _logoCache: string | null = null;

/** Original logo base64 — used for PDF and PNG invoices (color preserved) */
export async function getLogoBase64(): Promise<string | null> {
  if (_logoCache) return _logoCache;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        _logoCache = reader.result as string;
        resolve(_logoCache);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── THERMAL-OPTIMIZED LOGO (Dedicated B&W asset for 203 DPI thermal printers) ──
let _thermalLogoCache: string | null = null;

/**
 * Thermal logo pipeline — USES DEDICATED PRE-MADE B&W LOGO.
 *
 * Why a separate asset instead of processing the gold logo?
 *   - The gold logo has thin strokes, gradients, and fine details that CANNOT
 *     survive grayscale→threshold conversion at 203 DPI.
 *   - A dedicated B&W logo with thick strokes and bold text prints perfectly
 *     on every cheap thermal printer (Epson, TVS, Rongta, XPrinter, POS-58).
 *
 * Pipeline:
 *  1. Load dedicated thermal logo (pure black, thick strokes, 1024px source)
 *  2. Draw onto canvas with white background (eliminate any transparency)
 *  3. Apply strict B&W threshold (no grey pixels survive)
 *  4. Export as lossless PNG base64 at 576px wide (203 DPI × 72mm)
 */
import thermalLogoUrl from "@/assets/logo-thermal.png";

export async function getThermalLogoBase64(): Promise<string | null> {
  if (_thermalLogoCache) return _thermalLogoCache;
  try {
    // ── Step 1: Load the dedicated thermal logo ──
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Thermal logo load failed"));
      el.src = thermalLogoUrl;
    });

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    // ── Step 2: Draw on white background canvas at full res ──
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = srcW;
    fullCanvas.height = srcH;
    const fullCtx = fullCanvas.getContext("2d")!;

    // White background — kills any transparency
    fullCtx.fillStyle = "#ffffff";
    fullCtx.fillRect(0, 0, srcW, srcH);
    fullCtx.imageSmoothingEnabled = true;
    fullCtx.imageSmoothingQuality = "high";
    fullCtx.drawImage(img, 0, 0, srcW, srcH);

    // ── Step 3: Scale down to thermal print width ──
    // 576px = 203 DPI × ~72mm printable area on 80mm paper
    const FINAL_W = 576;
    const scale = FINAL_W / srcW;
    const FINAL_H = Math.round(srcH * scale);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = FINAL_W;
    outCanvas.height = FINAL_H;
    const outCtx = outCanvas.getContext("2d")!;

    // Use high-quality downscale
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, FINAL_W, FINAL_H);
    outCtx.drawImage(fullCanvas, 0, 0, FINAL_W, FINAL_H);

    // ── Step 4: Enforce pure B&W — no grey pixels ──
    const outData = outCtx.getImageData(0, 0, FINAL_W, FINAL_H);
    const px = outData.data;
    // Aggressive threshold: anything darker than 60% grey → pure black
    const THRESHOLD = 160;

    for (let i = 0; i < px.length; i += 4) {
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const val = gray < THRESHOLD ? 0 : 255;
      px[i] = px[i + 1] = px[i + 2] = val;
      px[i + 3] = 255; // fully opaque
    }
    outCtx.putImageData(outData, 0, 0);

    // ── Step 5: Export lossless PNG ──
    _thermalLogoCache = outCanvas.toDataURL("image/png");
    return _thermalLogoCache;
  } catch (err) {
    console.warn("[InvoiceService] Thermal logo processing failed:", err);
    return null;
  }
}

// ─── QR CODE (encodes public invoice URL) ────────────────────────────────────
export function getInvoiceUrl(invoiceNumber: string): string {
  // Auto-detect deployment domain (works on localhost, Vercel, custom domains)
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/invoice/${encodeURIComponent(invoiceNumber)}`;
}

export async function generateQRDataUrl(purchase: Purchase): Promise<string | null> {
  try {
    const invoiceUrl = getInvoiceUrl(purchase.invoice_number);
    return await QRCode.toDataURL(invoiceUrl, {
      width: 300,          // high-res for thermal sharpness
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

// ─── IMAGE LOADER ─────────────────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// ─── PDF INVOICE ─────────────────────────────────────────────────────────────
export async function generateInvoicePDF(purchase: Purchase): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const inv = purchase.invoice_number;
  const items = purchase.purchase_items ?? [];
  const custName = purchase.customers?.customer_name ?? "Walk-in Customer";
  const custPhone = purchase.customers?.phone_number ?? "";
  const date = fmtDate(purchase.purchase_date);
  const [r, g, b] = STORE.brandColor;

  // Header bar
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageW, 40, "F");

  const logo = await getLogoBase64();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 12, 6, 28, 28);
    } catch { /* logo load failed — skip */ }
  }

  const textX = logo ? 46 : pageW / 2;
  const textAlign = logo ? undefined : { align: "center" as const };

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(STORE.name, textX, 17, textAlign);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(STORE.addressOneLine, textX, 24, textAlign);
  doc.text("Phone: " + STORE.phone, textX, 29, textAlign);
  if (STORE.gst) doc.text("GST: " + STORE.gst, textX, 34, textAlign);

  // Section label
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", pageW / 2, 50, { align: "center" });
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(15, 52, pageW - 15, 52);

  // Bill To (left)
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text("Bill To:", 15, 59);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(custName, 15, 65);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  if (custPhone) doc.text("Phone: " + custPhone, 15, 71);

  // Invoice details (right)
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text("Invoice No:", pageW - 15, 59, { align: "right" });
  doc.setTextColor(r, g, b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(inv, pageW - 15, 65, { align: "right" });
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Date: " + date, pageW - 15, 71, { align: "right" });
  // Payment method display
  const payments = purchase.purchase_payments ?? [];
  if (purchase.payment_method === "Mixed" && payments.length > 0) {
    doc.text("Payment: Mixed", pageW - 15, 77, { align: "right" });
    let payY = 83;
    payments.forEach((pp) => {
      doc.setFontSize(7.5);
      doc.text(`${pp.payment_method}: ${fmtINR(pp.amount)}`, pageW - 15, payY, { align: "right" });
      payY += 5;
    });
    doc.setFontSize(8.5);
    if (STORE.gst) doc.text("GST No: " + STORE.gst, pageW - 15, payY, { align: "right" });
  } else {
    doc.text("Payment: " + (purchase.payment_method ?? "Cash"), pageW - 15, 77, { align: "right" });
    if (STORE.gst) doc.text("GST No: " + STORE.gst, pageW - 15, 83, { align: "right" });
  }

  // Items table — always show Subtotal + Overall Discount footer
  const pdfPayments = purchase.purchase_payments ?? [];
  const pdfPayLines = (purchase.payment_method === "Mixed" && pdfPayments.length > 0) ? pdfPayments.length * 5 : 0;
  const tableStartY = (STORE.gst ? 88 : 82) + pdfPayLines;
  const overallDiscount = (purchase as any).overall_discount ?? 0;
  const itemSubtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

  autoTable(doc, {
    startY: tableStartY,
    head: [["#", "Product", "Qty", "Unit Price", "Amount"]],
    body: items.map((it, i) => [
      String(i + 1),
      it.variant_label ? `${it.product_name}\n${it.variant_label}` : it.product_name,
      String(it.quantity),
      fmtINR(it.unit_price),
      fmtINR(it.quantity * it.unit_price),
    ]),
    foot: overallDiscount > 0
      ? [
          ["", "", "", "Subtotal", fmtINR(itemSubtotal)],
          ["", "", "", "Discount", `-${fmtINR(overallDiscount)}`],
          ["", "", "", "Grand Total", fmtINR(purchase.total_amount)],
        ]
      : [["", "", "", "Grand Total", fmtINR(purchase.total_amount)]],
    theme: "grid",
    headStyles: { fillColor: [r, g, b], textColor: 255, fontSize: 8.5, fontStyle: "bold" },
    footStyles: { fillColor: [250, 247, 244], textColor: [r, g, b], fontSize: 10, fontStyle: "bold" },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
    },
    margin: { left: 15, right: 15 },
  });

  const afterTable: number = (doc as any).lastAutoTable?.finalY ?? 140;

  // QR Code
  const qr = await generateQRDataUrl(purchase);
  if (qr) {
    doc.addImage(qr, "PNG", pageW / 2 - 17, afterTable + 8, 34, 34);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(inv, pageW / 2, afterTable + 45, { align: "center" });
  }

  // Footer
  const fy = qr ? afterTable + 54 : afterTable + 14;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(15, fy, pageW - 15, fy);

  doc.setFontSize(9.5);
  doc.setTextColor(r, g, b);
  doc.setFont("helvetica", "bold");
  doc.text("Thank you for shopping with " + STORE.name + "!", pageW / 2, fy + 8, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(130);
  doc.setFont("helvetica", "normal");
  doc.text("This is a computer-generated invoice. No signature required.", pageW / 2, fy + 14, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(0);
  doc.text("For: " + STORE.name, pageW - 15, fy + 26, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text("Authorized Signatory", pageW - 15, fy + 32, { align: "right" });

  return doc.output("blob");
}

// ─── PNG INVOICE (1200×1697 — A4 ratio at 144dpi) ───────────────────────────
export async function generateInvoicePNG(purchase: Purchase): Promise<Blob> {
  const W = 1200;
  const MARGIN = 72;
  const CONTENT_W = W - MARGIN * 2;
  const [r, g, b] = STORE.brandColor;
  const brandHex = `rgb(${r},${g},${b})`;

  const items = purchase.purchase_items ?? [];
  const custName = purchase.customers?.customer_name ?? "Walk-in Customer";
  const custPhone = purchase.customers?.phone_number ?? "";
  const inv = purchase.invoice_number;
  const date = fmtDate(purchase.purchase_date);
  const payMethod = purchase.payment_method ?? "Cash";
  const pngPayments = purchase.purchase_payments ?? [];

  // Dynamic height: header(220) + meta(170) + tableHeader(50) + rows + totals(80) + footer(240)
  const ROW_H = 52;
  const H = 220 + 170 + 50 + items.length * ROW_H + 80 + 300;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── Header bar ──
  ctx.fillStyle = brandHex;
  ctx.fillRect(0, 0, W, 200);

  // Logo
  const logoB64 = await getLogoBase64();
  if (logoB64) {
    try {
      const logoImg = await loadImage(logoB64);
      ctx.drawImage(logoImg, MARGIN, 28, 130, 130);
    } catch { /* skip */ }
  }

  // Store name + details (white text, right of logo)
  const hTextX = logoB64 ? MARGIN + 148 : W / 2;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = logoB64 ? "left" : "center";
  ctx.font = "bold 42px Helvetica, Arial, sans-serif";
  ctx.fillText(STORE.name, hTextX, 75);

  ctx.font = "22px Helvetica, Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(STORE.address1 + ", " + STORE.address2, hTextX, 112);
  ctx.fillText(STORE.address3 + ", " + STORE.address4, hTextX, 140);
  ctx.fillText("Phone: " + STORE.phone, hTextX, 168);
  if (STORE.gst) ctx.fillText("GST: " + STORE.gst, hTextX, 192);

  // ── TAX INVOICE label ──
  let cursor = 220;
  ctx.fillStyle = "#1f2937";
  ctx.textAlign = "center";
  ctx.font = "bold 30px Helvetica, Arial, sans-serif";
  ctx.fillText("TAX INVOICE", W / 2, cursor + 42);

  // Underline
  ctx.strokeStyle = brandHex;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, cursor + 52);
  ctx.lineTo(W - MARGIN, cursor + 52);
  ctx.stroke();
  cursor += 72;

  // ── Bill To / Invoice Details ──
  ctx.textAlign = "left";
  ctx.font = "22px Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText("Bill To:", MARGIN, cursor + 26);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 28px Helvetica, Arial, sans-serif";
  ctx.fillText(custName, MARGIN, cursor + 60);
  ctx.font = "22px Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#4b5563";
  if (custPhone) ctx.fillText("Phone: " + custPhone, MARGIN, cursor + 90);

  // Invoice info right side
  ctx.textAlign = "right";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "22px Helvetica, Arial, sans-serif";
  ctx.fillText("Invoice Details:", W - MARGIN, cursor + 26);

  ctx.fillStyle = brandHex;
  ctx.font = "bold 26px Helvetica, Arial, sans-serif";
  ctx.fillText(inv, W - MARGIN, cursor + 60);

  ctx.fillStyle = "#4b5563";
  ctx.font = "22px Helvetica, Arial, sans-serif";
  ctx.fillText("Date: " + date, W - MARGIN, cursor + 90);
  if (payMethod === "Mixed" && pngPayments.length > 0) {
    ctx.fillText("Payment: Mixed", W - MARGIN, cursor + 118);
    let payOff = 142;
    ctx.font = "20px Helvetica, Arial, sans-serif";
    pngPayments.forEach((pp) => {
      ctx.fillText(`${pp.payment_method}: ${fmtINR(pp.amount)}`, W - MARGIN, cursor + payOff);
      payOff += 26;
    });
  } else {
    ctx.fillText("Payment: " + payMethod, W - MARGIN, cursor + 118);
  }
  if (STORE.gst) ctx.fillText("GST: " + STORE.gst, W - MARGIN, cursor + 146);

  cursor += STORE.gst ? 170 : 142;

  // ── Table header row ──
  const hasDiscount = items.some((it) => (it.discount ?? 0) > 0);
  ctx.fillStyle = brandHex;
  ctx.fillRect(MARGIN, cursor, CONTENT_W, 50);

  let colX: number[], headers: string[], aligns: CanvasTextAlign[];
  if (hasDiscount) {
    colX   = [MARGIN + 14, MARGIN + 54, MARGIN + 530, MARGIN + 650, MARGIN + 800, MARGIN + 970];
    headers = ["#", "Product", "Qty", "Price", "Discount", "Amount"];
    aligns  = ["center", "left", "center", "right", "right", "right"];
  } else {
    colX   = [MARGIN + 14, MARGIN + 66, MARGIN + 660, MARGIN + 800, MARGIN + 970];
    headers = ["#", "Product", "Qty", "Price/Unit", "Amount"];
    aligns  = ["center", "left", "center", "right", "right"];
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px Helvetica, Arial, sans-serif";

  headers.forEach((h, i) => {
    ctx.textAlign = aligns[i];
    ctx.fillText(h, colX[i], cursor + 33);
  });
  cursor += 50;

  // ── Table rows ──
  const colSepOffsets = hasDiscount ? [40, 480, 600, 750, 890] : [50, 600, 740, 890];
  items.forEach((it, i) => {
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#fdf8f5";
    ctx.fillRect(MARGIN, cursor, CONTENT_W, ROW_H);

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, cursor, CONTENT_W, ROW_H);

    ctx.beginPath();
    colSepOffsets.forEach((dx) => {
      ctx.moveTo(MARGIN + dx, cursor);
      ctx.lineTo(MARGIN + dx, cursor + ROW_H);
    });
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "20px Helvetica, Arial, sans-serif";

    const displayName = it.variant_label ? `${it.product_name} (${it.variant_label})` : it.product_name;
    let cells: string[];
    if (hasDiscount) {
      const disc = it.discount ?? 0;
      cells = [String(i + 1), displayName, String(it.quantity), fmtINR(it.unit_price), disc > 0 ? `-${fmtINR(disc)}` : "—", fmtINR(it.total)];
    } else {
      cells = [String(i + 1), displayName, String(it.quantity), fmtINR(it.unit_price), fmtINR(it.total)];
    }
    cells.forEach((cell, ci) => {
      ctx.textAlign = aligns[ci];
      // Show discount in red
      if (hasDiscount && ci === 4 && (it.discount ?? 0) > 0) ctx.fillStyle = "#b91c1c";
      else ctx.fillStyle = "#111827";
      ctx.fillText(cell, colX[ci], cursor + ROW_H / 2 + 7);
    });
    cursor += ROW_H;
  });

  // ── Grand Total / Discount summary ──
  const overallDisc = (purchase as any).overall_discount ?? 0;
  const pngItemSubtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

  if (overallDisc > 0) {
    // Subtotal row
    ctx.fillStyle = "#faf6f2";
    ctx.fillRect(MARGIN, cursor, CONTENT_W, 48);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, cursor, CONTENT_W, 48);
    ctx.fillStyle = "#6b7280";
    ctx.font = "22px Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Subtotal", MARGIN + 880, cursor + 32);
    ctx.fillStyle = "#111827";
    ctx.fillText(fmtINR(pngItemSubtotal), W - MARGIN, cursor + 32);
    cursor += 48;

    // Discount row
    ctx.fillStyle = "#fff5f5";
    ctx.fillRect(MARGIN, cursor, CONTENT_W, 48);
    ctx.strokeStyle = "#e5e7eb";
    ctx.strokeRect(MARGIN, cursor, CONTENT_W, 48);
    ctx.fillStyle = "#dc2626";
    ctx.font = "22px Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Overall Discount", MARGIN + 880, cursor + 32);
    ctx.fillText(`-${fmtINR(overallDisc)}`, W - MARGIN, cursor + 32);
    cursor += 48;
  }

  // Grand Total row
  ctx.fillStyle = "#faf6f2";
  ctx.fillRect(MARGIN, cursor, CONTENT_W, 58);
  ctx.strokeStyle = brandHex;
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN, cursor, CONTENT_W, 58);

  ctx.beginPath();
  ctx.moveTo(MARGIN + 890, cursor);
  ctx.lineTo(MARGIN + 890, cursor + 58);
  ctx.stroke();

  ctx.fillStyle = brandHex;
  ctx.font = "bold 24px Helvetica, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Grand Total", MARGIN + 880, cursor + 38);
  ctx.fillText(fmtINR(purchase.total_amount), W - MARGIN, cursor + 38);
  cursor += 78;

  // ── Terms + Signature ──
  ctx.textAlign = "left";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "bold 20px Helvetica, Arial, sans-serif";
  ctx.fillText("Terms and Conditions:", MARGIN, cursor);
  ctx.fillStyle = "#4b5563";
  ctx.font = "19px Helvetica, Arial, sans-serif";
  ctx.fillText("Thank you for shopping with " + STORE.name + ".", MARGIN, cursor + 30);
  ctx.fillText("All goods once sold are non-refundable.", MARGIN, cursor + 56);

  ctx.textAlign = "right";
  ctx.fillStyle = "#111827";
  ctx.font = "20px Helvetica, Arial, sans-serif";
  ctx.fillText("For: " + STORE.name, W - MARGIN, cursor);

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W - MARGIN - 280, cursor + 70);
  ctx.lineTo(W - MARGIN, cursor + 70);
  ctx.stroke();

  ctx.fillStyle = "#4b5563";
  ctx.font = "bold 18px Helvetica, Arial, sans-serif";
  ctx.fillText("Authorized Signatory", W - MARGIN, cursor + 96);

  cursor += 130;

  // ── QR Code ──
  const qrDataUrl = await generateQRDataUrl(purchase);
  if (qrDataUrl) {
    try {
      const qrImg = await loadImage(qrDataUrl);
      ctx.drawImage(qrImg, W / 2 - 70, cursor, 140, 140);
      ctx.fillStyle = "#4b5563";
      ctx.font = "18px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(inv, W / 2, cursor + 160);
    } catch { /* skip */ }
    cursor += 180;
  }

  // ── Footer ──
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, cursor + 10);
  ctx.lineTo(W - MARGIN, cursor + 10);
  ctx.stroke();

  ctx.fillStyle = "#9ca3af";
  ctx.font = "17px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("This is a computer-generated invoice. No signature required.", W / 2, cursor + 36);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
      "image/png",
    );
  });
}

// ─── THERMAL RECEIPT (80mm — Production Optimized) ───────────────────────────
export async function printThermalReceipt(purchase: Purchase): Promise<void> {
  const inv       = purchase.invoice_number;
  const items     = purchase.purchase_items ?? [];
  const custName  = purchase.customers?.customer_name ?? "Walk-in Customer";
  const custPhone = purchase.customers?.phone_number ?? "";
  const date      = fmtDate(purchase.purchase_date);
  const time      = fmtTime(purchase.purchase_date);
  // Payment method string for thermal receipt
  const paymentsList = purchase.purchase_payments ?? [];
  let payHtml: string;
  if (purchase.payment_method === "Mixed" && paymentsList.length > 0) {
    payHtml = paymentsList.map((pp) => `<div class="payrow">${pp.payment_method}: ${fmtINR(pp.amount)}</div>`).join("");
  } else {
    payHtml = `<div class="payrow">Payment: ${purchase.payment_method ?? "Cash"}</div>`;
  }

  // Preload assets before opening print window
  // Use thermal-processed B&W logo (not the original color logo)
  const thermalLogo = await getThermalLogoBase64();
  const qr = await generateQRDataUrl(purchase);

  // Logo: high-res B&W image with smooth rendering, or bold text fallback
  const logoHtml = thermalLogo
    ? `<img src="${thermalLogo}" alt="logo" class="receipt-logo" style="display:block;margin:0 auto 6px;width:240px;height:auto">`
    : `<div style="font-size:16px;font-weight:900;color:#000;text-align:center;letter-spacing:0.5px;margin:4px 0 6px">${STORE.name}</div>`;

  const qrHtml = qr
    ? `<img src="${qr}" alt="qr" class="receipt-qr" style="display:block;margin:4px auto 2px;width:150px;height:150px">`
    : "";

  // Item rows — product name + variant label + qty×price + subtotal only
  const overallDiscThermal = (purchase as any).overall_discount ?? 0;
  const itemsSubtotalThermal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

  const rows = items.map((it) => {
    const subtotal = it.quantity * it.unit_price;
    let html = `<div class="iname">${it.product_name}</div>`;
    if (it.variant_label) html += `<div class="ivariant">${it.variant_label}</div>`;
    html += `<div class="irow"><span>${it.quantity} x ${fmtINR(it.unit_price)}</span><span class="iprice">${fmtINR(subtotal)}</span></div>`;
    return html;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${inv}</title>
<style>
@page {
  size: 80mm auto;
  margin: 2mm;
}
@media print {
  html, body { width: 80mm; }
  @page { size: 80mm auto; margin: 2mm; }
}
*, *::before, *::after {
  margin: 0; padding: 0; box-sizing: border-box;
}
html, body {
  width: 76mm;
  background: #fff;
  color: #000;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body { padding: 2mm 2mm 4mm; }

/* ── Store header ── */
.sname {
  font-size: 15px; font-weight: 900;
  color: #000; text-align: center;
  letter-spacing: 0.3px; margin: 3px 0 2px;
}
.saddr {
  font-size: 10px; font-weight: 700;
  color: #000; text-align: center; line-height: 1.5;
}
.sphone {
  font-size: 11px; font-weight: 700;
  color: #000; text-align: center; margin-top: 2px;
}

/* ── Separators — pure black ── */
.dash  { border: none; border-top: 2px dashed #000; margin: 5px 0; }
.solid { border: none; border-top: 2px solid #000;  margin: 5px 0; }
.thick { border: none; border-top: 3px solid #000;  margin: 5px 0; }

/* ── Meta rows ── */
.mrow {
  display: flex; justify-content: space-between;
  font-size: 11.5px; font-weight: 700; color: #000; margin: 2px 0;
}
.mlabel { font-weight: 900; color: #000; }
.invnum { font-size: 13px; font-weight: 900; color: #000; letter-spacing: 0.2px; }

/* ── Customer ── */
.crow { font-size: 12px; font-weight: 700; color: #000; margin: 1px 0; }

/* ── Product rows ── */
.iname    { font-size: 12px; font-weight: 900; color: #000; margin-top: 5px; line-height: 1.3; }
.ivariant { font-size: 10.5px; font-weight: 700; color: #000; margin: 0 0 1px; }
.irow     { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 700; color: #000; margin-bottom: 1px; }
.iprice   { font-weight: 900; color: #000; }

/* ── Total ── */
.total-row {
  display: flex; justify-content: space-between;
  font-size: 18px; font-weight: 900; color: #000;
  margin: 4px 0; letter-spacing: 0.3px;
}

/* ── Payment ── */
.payrow { font-size: 12.5px; font-weight: 900; color: #000; }

/* ── QR label ── */
.qrlabel {
  font-size: 9px; font-weight: 700; color: #000;
  text-align: center; margin-top: 2px; letter-spacing: 0.5px;
}

/* ── Footer ── */
.ftmain { font-size: 12px; font-weight: 900; color: #000; text-align: center; margin-top: 3px; }
.ftsub  { font-size: 9.5px; font-weight: 700; color: #000; text-align: center; margin-top: 1px; }

/* ── Images ── */
img {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  color-adjust: exact;
}

/* Logo: crisp pixel-perfect B&W rendering for thermal */
.receipt-logo {
  image-rendering: crisp-edges;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: pixelated;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* QR code: sharp pixel boundaries */
.receipt-qr {
  image-rendering: crisp-edges;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: pixelated;
}

/* ── Thermal Print Optimization ── */
@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .receipt-logo {
    image-rendering: crisp-edges !important;
    image-rendering: pixelated !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .receipt-qr {
    image-rendering: pixelated !important;
  }
}
</style>
</head>
<body>

<div style="text-align:center">
  ${logoHtml}
  <div class="sname">${STORE.name}</div>
  <div class="saddr">${STORE.address1}<br>${STORE.address2}<br>${STORE.address3}<br>${STORE.address4}</div>
  <div class="sphone">Phone: ${STORE.phone}</div>
</div>

<hr class="dash">

<div class="mrow">
  <span class="mlabel">Invoice:</span>
  <span class="invnum">${inv}</span>
</div>
<div class="mrow">
  <span>${date}</span>
  <span>${time}</span>
</div>

<hr class="dash">

<div class="crow"><span class="mlabel">Customer:</span> ${custName}</div>
${custPhone ? `<div class="crow"><span class="mlabel">Phone:</span> ${custPhone}</div>` : ""}

<hr class="dash">

${rows}

<hr class="thick">

${overallDiscThermal > 0 ? `
<div class="irow" style="font-size:13px">
  <span>Subtotal</span><span>${fmtINR(itemsSubtotalThermal)}</span>
</div>
<div class="irow" style="color:#b91c1c;font-size:13px">
  <span>Discount</span><span>-${fmtINR(overallDiscThermal)}</span>
</div>
` : ""}
<div class="total-row">
  <span>TOTAL</span>
  <span>${fmtINR(purchase.total_amount)}</span>
</div>

<hr class="dash">

${payHtml}

<hr class="dash">

<div style="text-align:center">
  ${qrHtml}
  <div class="qrlabel">${inv}</div>
</div>

<hr class="dash">

<div class="ftmain">Thank You! Visit Again</div>
<div class="ftsub">Computer-generated receipt</div>

</body>
</html>`;

  const w = window.open("", "_blank", "width=320,height=640");
  if (!w) return;
  w.document.write(html);
  w.document.close();

  // Wait for every image (logo + QR) to load before printing
  const allImgs = Array.from(w.document.querySelectorAll("img"));
  await Promise.all(
    allImgs.map(
      (img) =>
        new Promise<void>((res) => {
          if (img.complete && img.naturalWidth > 0) return res();
          img.onload  = () => res();
          img.onerror = () => { img.style.display = "none"; res(); };
        }),
    ),
  );

  // Brief settle then print — 600ms gives thermal printers time to buffer the B&W logo
  setTimeout(() => {
    w.focus();
    w.print();
    w.onafterprint = () => w.close();
  }, 600);
}
