-- ═══════════════════════════════════════════════════════════════
-- Billova Perfumes — v3 Migration: Invoice Image URL + WhatsApp Tracking
-- Run AFTER invoice_migration_v2.sql
-- ═══════════════════════════════════════════════════════════════

-- 1. Add invoice_image_url (PNG stored in Supabase Storage)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_image_url TEXT;

-- 2. Rename ambiguous whatsapp_sent INT → keep it, add timestamp columns
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_pdf_url    TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS printed_count      INT DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS last_printed_at    TIMESTAMPTZ;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS whatsapp_sent      INT DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS whatsapp_sent_at   TIMESTAMPTZ;

-- 3. Ensure receipt_logs has customer_name for audit display
ALTER TABLE receipt_logs ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- 4. Storage bucket instructions (run via Supabase Dashboard > Storage)
--    Bucket name : invoices
--    Public      : YES
--    File size   : 10 MB
--    MIME types  : image/png, application/pdf

-- 5. RLS policies for the invoices bucket
-- Allow authenticated users to upload
-- (run in Supabase Dashboard > Storage > invoices > Policies)
--
--   INSERT policy:
--     CREATE POLICY "Authenticated upload"
--     ON storage.objects FOR INSERT
--     TO authenticated
--     WITH CHECK (bucket_id = 'invoices');
--
--   SELECT policy (public read):
--     CREATE POLICY "Public read"
--     ON storage.objects FOR SELECT
--     TO public
--     USING (bucket_id = 'invoices');

-- 6. Verify columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'purchases'
  AND column_name IN (
    'invoice_number', 'invoice_pdf_url', 'invoice_image_url',
    'printed_count', 'last_printed_at',
    'whatsapp_sent', 'whatsapp_sent_at'
  )
ORDER BY column_name;
