-- ═══════════════════════════════════════════════════════════════
-- Billova Perfumes — POS Invoice & Receipt Tracking Migration
-- Run this in the Supabase SQL Editor BEFORE deploying the new code.
-- ═══════════════════════════════════════════════════════════════

-- 1. Add invoice_number column to purchases
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_number TEXT UNIQUE;

-- 2. Backfill existing purchases with invoice numbers
DO $$
DECLARE
  rec RECORD;
  seq INT := 0;
  last_date TEXT := '';
  cur_date TEXT;
BEGIN
  FOR rec IN
    SELECT id, purchase_date
    FROM purchases
    WHERE invoice_number IS NULL
    ORDER BY purchase_date ASC, created_at ASC
  LOOP
    cur_date := TO_CHAR(rec.purchase_date::date, 'YYYYMMDD');
    IF cur_date <> last_date THEN
      seq := 1;
      last_date := cur_date;
    ELSE
      seq := seq + 1;
    END IF;
    UPDATE purchases SET invoice_number = 'BP-' || cur_date || '-' || LPAD(seq::text, 4, '0')
    WHERE id = rec.id;
  END LOOP;
END $$;

-- 3. Make invoice_number NOT NULL after backfill
ALTER TABLE purchases ALTER COLUMN invoice_number SET NOT NULL;

-- 4. Create receipt_logs table for print/WhatsApp audit trail
CREATE TABLE IF NOT EXISTS receipt_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('print', 'whatsapp', 'pdf')),
  performed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  performed_by UUID REFERENCES auth.users(id)
);

-- 5. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_receipt_logs_purchase ON receipt_logs(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchases_invoice ON purchases(invoice_number);

-- 6. Enable RLS on receipt_logs
ALTER TABLE receipt_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'receipt_logs' AND policyname = 'Authenticated users can view receipt_logs') THEN
    CREATE POLICY "Authenticated users can view receipt_logs" ON receipt_logs FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'receipt_logs' AND policyname = 'Authenticated users can insert receipt_logs') THEN
    CREATE POLICY "Authenticated users can insert receipt_logs" ON receipt_logs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- 7. Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'purchases' AND column_name = 'invoice_number';

SELECT * FROM information_schema.tables WHERE table_name = 'receipt_logs';
