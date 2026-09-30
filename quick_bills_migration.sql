-- ═══════════════════════════════════════════════════════════════
-- QUICK BILLS MIGRATION — Run this in Supabase SQL Editor
-- Adds billing_mode column and back-fills existing data.
-- ═══════════════════════════════════════════════════════════════

-- 1. Add billing_mode column (safe to run multiple times)
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS billing_mode text
  CHECK (billing_mode IN ('customer', 'quick'))
  DEFAULT 'customer';

-- 2. Back-fill existing records:
--    • Purchases WITH a customer_id  → 'customer'
--    • Purchases WITHOUT customer_id → 'quick'  (legacy walk-ins)
UPDATE purchases
  SET billing_mode = 'customer'
  WHERE customer_id IS NOT NULL
    AND (billing_mode IS NULL OR billing_mode = 'customer');

UPDATE purchases
  SET billing_mode = 'quick'
  WHERE customer_id IS NULL
    AND (billing_mode IS NULL);

-- 3. Index for fast tab queries
CREATE INDEX IF NOT EXISTS idx_purchases_billing_mode
  ON purchases(billing_mode, purchase_date DESC);

-- 4. Sanity check — shows count of each mode
SELECT
  billing_mode,
  COUNT(*) AS total_purchases,
  COALESCE(SUM(total_amount), 0) AS total_revenue
FROM purchases
GROUP BY billing_mode
ORDER BY billing_mode;
