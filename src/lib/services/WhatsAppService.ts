/**
 * WhatsAppService
 * Single responsibility: deliver a WhatsApp message payload.
 *
 * Mode 1 — Current (fallback): wa.me deep-link (text only)
 * Mode 2 — Future: WhatsApp Business Cloud API (image + caption)
 *
 * To upgrade to the Cloud API later:
 *   1. Set VITE_WA_API_TOKEN and VITE_WA_PHONE_ID in .env
 *   2. Switch WHATSAPP_MODE to "cloud" in .env
 *   3. No other code changes needed.
 */

import type { WhatsAppPayload } from "./MessageBuilder";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const MODE = (import.meta.env.VITE_WHATSAPP_MODE ?? "web") as "web" | "cloud";
const CLOUD_API_TOKEN = import.meta.env.VITE_WA_API_TOKEN ?? "";
const CLOUD_PHONE_ID = import.meta.env.VITE_WA_PHONE_ID ?? "";
const CLOUD_API_URL = `https://graph.facebook.com/v18.0/${CLOUD_PHONE_ID}/messages`;

// ─── MODE 1: wa.me deep-link ─────────────────────────────────────────────────
function sendViaWebLink(payload: WhatsAppPayload): void {
  const url = `https://wa.me/${payload.recipientPhone}?text=${encodeURIComponent(payload.messageText)}`;
  window.open(url, "_blank");
}

// ─── MODE 2: WhatsApp Business Cloud API ─────────────────────────────────────
// This fires a real API call — only active when VITE_WHATSAPP_MODE=cloud
async function sendViaCloudAPI(payload: WhatsAppPayload): Promise<void> {
  if (!CLOUD_API_TOKEN || !CLOUD_PHONE_ID) {
    console.warn("[WhatsAppService] Cloud API credentials missing — falling back to web link");
    sendViaWebLink(payload);
    return;
  }

  if (!payload.invoiceImageUrl) {
    // No image URL — send text message only
    const body = {
      messaging_product: "whatsapp",
      to: payload.recipientPhone,
      type: "text",
      text: { body: payload.messageText },
    };
    await fetch(CLOUD_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOUD_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return;
  }

  // Send image + caption (invoice image as first message)
  const body = {
    messaging_product: "whatsapp",
    to: payload.recipientPhone,
    type: "image",
    image: {
      link: payload.invoiceImageUrl,
      caption: payload.messageText,
    },
  };

  const res = await fetch(CLOUD_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUD_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[WhatsAppService] Cloud API error: ${err}`);
  }
}

/**
 * Primary entry point — call this from the orchestrator.
 * Automatically routes to the correct mode.
 */
export async function sendWhatsAppMessage(payload: WhatsAppPayload): Promise<void> {
  if (MODE === "cloud") {
    await sendViaCloudAPI(payload);
  } else {
    sendViaWebLink(payload);
  }
}
