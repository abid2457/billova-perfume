/**
 * MessageBuilder
 * Single responsibility: build the WhatsApp message payload.
 * No emojis. No markdown bold. Clean UTF-8 only.
 * Future-ready: returns a typed payload that WhatsAppService can consume.
 */

import type { Purchase } from "@/lib/types";
import { STORE, fmtDate, fmtINR } from "./InvoiceService";

export interface WhatsAppPayload {
  /** E.164 format phone number — e.g. 918098755101 */
  recipientPhone: string;
  /** Plain text message body — no emojis, no markdown */
  messageText: string;
  /** Public URL of the invoice image (PNG). Null if upload failed. */
  invoiceImageUrl: string | null;
  /** Public URL of the invoice PDF. Null if not generated. */
  invoicePdfUrl: string | null;
  /** Invoice number for tracking */
  invoiceNumber: string;
}

/**
 * Format a phone number to E.164 (Indian numbers).
 * Strips non-digits, adds country code 91 if missing.
 */
export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

/**
 * Build the professional WhatsApp message body.
 * No emojis. No asterisks. Plain UTF-8 text only.
 */
export function buildMessageText(
  purchase: Purchase,
  invoiceImageUrl: string | null,
): string {
  const custName = purchase.customers?.customer_name ?? "Valued Customer";
  const inv = purchase.invoice_number;
  const date = fmtDate(purchase.purchase_date);
  const amount = purchase.total_amount;

  const lines: string[] = [
    `Greetings from ${STORE.name}`,
    "",
    `Dear ${custName},`,
    "",
    `We are pleased to have you as our valued customer.`,
    "",
    `Please find your purchase invoice attached.`,
    "",
    `Invoice Number:`,
    inv,
    "",
    `Invoice Date:`,
    date,
    "",
    `Invoice Amount:`,
    `Rs.${amount.toLocaleString("en-IN")}`,
    "",
    `If you have any questions regarding your purchase, please contact us.`,
    "",
    STORE.name,
    "",
    STORE.address1,
    STORE.address2,
    STORE.address3,
    STORE.address4,
    "",
    `Phone:`,
    STORE.phone,
    "",
    `Thank you for shopping with ${STORE.name}.`,
    "",
    `Regards,`,
    "",
    STORE.name,
  ];

  if (invoiceImageUrl) {
    lines.push("", "Invoice Download:", invoiceImageUrl);
  }

  return lines.join("\n");
}

/**
 * Build the full WhatsApp payload for a purchase.
 * This is the single source of truth for WhatsApp data.
 */
export function buildWhatsAppPayload(
  purchase: Purchase,
  invoiceImageUrl: string | null,
  invoicePdfUrl: string | null = null,
): WhatsAppPayload {
  const phone = purchase.customers?.phone_number ?? "";
  return {
    recipientPhone: formatPhoneE164(phone),
    messageText: buildMessageText(purchase, invoiceImageUrl),
    invoiceImageUrl,
    invoicePdfUrl,
    invoiceNumber: purchase.invoice_number,
  };
}
