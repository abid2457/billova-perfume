-- ═══════════════════════════════════════════════════════════════
-- Billova Perfumes — Extended Invoice Fields & Storage Setup
-- Run AFTER invoice_migration.sql
-- ═══════════════════════════════════════════════════════════════

-- 1. Add extended columns to purchases
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS printed_count INT DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS last_printed_at TIMESTAMPTZ;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS whatsapp_sent INT DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;

-- 2. Add customer_id to receipt_logs for audit
ALTER TABLE receipt_logs ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- 3. Create storage bucket for invoices (run via Supabase Dashboard > Storage > New Bucket)
-- Bucket name: invoices
-- Public: YES
-- File size limit: 5MB
-- Allowed MIME: application/pdf

-- 4. Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'purchases'
  AND column_name IN ('invoice_pdf_url', 'printed_count', 'last_printed_at', 'whatsapp_sent', 'whatsapp_sent_at')
ORDER BY column_name;
