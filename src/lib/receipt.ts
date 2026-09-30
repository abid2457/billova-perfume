/**
 * receipt.ts — Orchestrator
 * ─────────────────────────
 * This file coordinates the four services.
 * It contains NO business logic of its own.
 *
 * Services:
 *   InvoiceService  — generates PDF and PNG invoices
 *   StorageService  — uploads files to Supabase Storage
 *   MessageBuilder  — builds WhatsApp payload (no emojis)
 *   WhatsAppService — sends via wa.me (now) or Cloud API (future)
 */

import { supabase } from "./supabase";
import type { Purchase } from "./types";

// ─── SERVICE IMPORTS ─────────────────────────────────────────────────────────
import {
  generateInvoicePDF,
  generateInvoicePNG,
  printThermalReceipt as _printThermal,
} from "./services/InvoiceService";

import { uploadInvoiceFile, getCachedUrl } from "./services/StorageService";
import { buildWhatsAppPayload } from "./services/MessageBuilder";
import { sendWhatsAppMessage } from "./services/WhatsAppService";

// Re-export these so existing components don't need import path changes
export { generateInvoicePDF, generateInvoicePNG };
export { printThermalReceipt } from "./services/InvoiceService";
export { buildMessageText as buildInvoiceMessage } from "./services/MessageBuilder";
export type { WhatsAppPayload } from "./services/MessageBuilder";

// ─── AUDIT LOGGER ────────────────────────────────────────────────────────────
async function logAction(
  purchase: Purchase,
  action: "print" | "whatsapp" | "pdf",
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("receipt_logs").insert({
      purchase_id: purchase.id,
      invoice_number: purchase.invoice_number,
      action,
      performed_by: user?.id ?? null,
      customer_name: purchase.customers?.customer_name ?? null,
    });

    if (action === "print") {
      await supabase
        .from("purchases")
        .update({
          printed_count: ((purchase as any).printed_count ?? 0) + 1,
          last_printed_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
    } else if (action === "whatsapp") {
      await supabase
        .from("purchases")
        .update({
          whatsapp_sent: ((purchase as any).whatsapp_sent ?? 0) + 1,
          whatsapp_sent_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);
    }
  } catch (err) {
    console.error("[receipt] logAction failed:", err);
  }
}

// ─── PUBLIC: DOWNLOAD PDF ────────────────────────────────────────────────────
export async function downloadInvoicePDF(purchase: Purchase): Promise<void> {
  try {
    const blob = await generateInvoicePDF(purchase);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${purchase.invoice_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    logAction(purchase, "pdf").catch(console.error);
  } catch {
    const { toast } = await import("sonner");
    toast.error("Unable to generate invoice. Please try again.");
  }
}

// ─── PUBLIC: PRINT THERMAL RECEIPT ───────────────────────────────────────────
export async function printReceipt(purchase: Purchase): Promise<void> {
  await _printThermal(purchase);
  logAction(purchase, "print").catch(console.error);
}

// ─── PUBLIC: SEND WHATSAPP E-BILL ────────────────────────────────────────────
/**
 * Full workflow:
 *   1. Generate PNG invoice (canvas-based, high-res)
 *   2. Upload PNG to Supabase Storage → get public URL
 *   3. Build WhatsApp payload (no emojis, no markdown)
 *   4. Send via wa.me (or Cloud API when credentials set)
 *   5. Log audit entry
 *
 * If PNG upload fails → still opens WhatsApp with text only
 * If PNG generation fails → shows error toast, stops
 */
export async function sendWhatsAppBill(purchase: Purchase): Promise<void> {
  const custPhone = purchase.customers?.phone_number ?? "";
  if (!custPhone) return;

  const { toast } = await import("sonner");

  // ── Step 1: Generate invoice PNG ──
  let pngBlob: Blob;
  try {
    pngBlob = await generateInvoicePNG(purchase);
  } catch (err) {
    console.error("[receipt] PNG generation failed:", err);
    toast.error("Unable to generate invoice image. Please try again.");
    return;
  }

  // ── Step 2: Upload to Supabase Storage ──
  let imageUrl: string | null = getCachedUrl(purchase, "png");

  if (!imageUrl) {
    imageUrl = await uploadInvoiceFile(purchase, pngBlob, "png");
  }

  if (!imageUrl) {
    // Upload failed — offer local PDF download as fallback
    console.warn("[receipt] Upload failed — falling back to local download");
    try {
      const pdfBlob = await generateInvoicePDF(purchase);
      const localUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = localUrl;
      a.download = `${purchase.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(localUrl);
    } catch { /* ignore secondary failure */ }
  }

  // ── Step 3 + 4: Build payload and send ──
  const payload = buildWhatsAppPayload(purchase, imageUrl);
  await sendWhatsAppMessage(payload);

  // ── Step 5: Audit log ──
  logAction(purchase, "whatsapp").catch(console.error);
}
