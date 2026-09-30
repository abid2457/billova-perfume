/**
 * StorageService
 * Single responsibility: upload invoice files to Supabase Storage
 * and persist the public URL back to the purchase record.
 */

import { supabase } from "@/lib/supabase";
import type { Purchase } from "@/lib/types";

export type InvoiceFileType = "pdf" | "png";

const BUCKET = "invoices";

function filePath(purchase: Purchase, ext: InvoiceFileType): string {
  return `invoices/${purchase.invoice_number}.${ext}`;
}

function mimeType(ext: InvoiceFileType): string {
  return ext === "png" ? "image/png" : "application/pdf";
}

/**
 * Upload a Blob to Supabase Storage under the invoices/ prefix.
 * Always upserts (safe to re-run).
 * Returns the public URL or null on failure.
 */
export async function uploadInvoiceFile(
  purchase: Purchase,
  blob: Blob,
  ext: InvoiceFileType = "png",
): Promise<string | null> {
  try {
    const path = filePath(purchase, ext);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: mimeType(ext), upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = data.publicUrl;

    // Persist URL to purchases table
    const dbField = ext === "png" ? "invoice_image_url" : "invoice_pdf_url";
    await supabase.from("purchases").update({ [dbField]: url }).eq("id", purchase.id);

    return url;
  } catch (err) {
    console.error("[StorageService] Upload failed:", err);
    return null;
  }
}

/**
 * Return cached invoice image URL from DB if it already exists.
 * Pass ext = 'pdf' to check for PDF instead.
 */
export function getCachedUrl(purchase: Purchase, ext: InvoiceFileType = "png"): string | null {
  const field = ext === "png" ? "invoice_image_url" : "invoice_pdf_url";
  return (purchase as any)[field] ?? null;
}
