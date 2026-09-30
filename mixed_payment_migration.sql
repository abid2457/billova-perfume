-- ═══════════════════════════════════════════════════════════════
-- Billova Perfumes — Mixed Payment Support Migration
-- ═══════════════════════════════════════════════════════════════
-- Run this in the Supabase SQL Editor.
--
-- Creates a new purchase_payments table for split payments.
-- Does NOT touch the existing payment_method column.
-- Full backward compatibility preserved.
-- ═══════════════════════════════════════════════════════════════

-- 1. Create purchase_payments table
CREATE TABLE IF NOT EXISTS purchase_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Index for fast lookup by purchase_id
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id
  ON purchase_payments(purchase_id);

-- 3. RLS — authenticated users can CRUD
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_payments' AND policyname = 'Auth users can view purchase_payments'
  ) THEN
    CREATE POLICY "Auth users can view purchase_payments"
      ON purchase_payments FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_payments' AND policyname = 'Auth users can insert purchase_payments'
  ) THEN
    CREATE POLICY "Auth users can insert purchase_payments"
      ON purchase_payments FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_payments' AND policyname = 'Auth users can delete purchase_payments'
  ) THEN
    CREATE POLICY "Auth users can delete purchase_payments"
      ON purchase_payments FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- 4. Anon SELECT for public invoice page
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_payments' AND policyname = 'Public can view purchase_payments'
  ) THEN
    CREATE POLICY "Public can view purchase_payments"
      ON purchase_payments FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- 5. Verify
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'purchase_payments'
ORDER BY policyname;
