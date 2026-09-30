-- =============================================
-- Quick Bill Enhancement Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add billing_mode column to purchases table
ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'customer';

-- 2. Backfill existing records: purchases without a customer_id are quick bills
UPDATE purchases
SET billing_mode = 'quick'
WHERE customer_id IS NULL;

-- 3. Add an index for filtering by billing_mode
CREATE INDEX IF NOT EXISTS idx_purchases_billing_mode
ON purchases (billing_mode);

-- 4. Verify the migration
SELECT billing_mode, COUNT(*) as count
FROM purchases
GROUP BY billing_mode;
