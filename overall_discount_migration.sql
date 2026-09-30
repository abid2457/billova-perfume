-- ─── Overall Discount Migration ─────────────────────────────────────────────
-- Run this in your Supabase SQL Editor to add overall_discount to purchases.
-- Safe: existing records get DEFAULT 0 — nothing breaks.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS overall_discount NUMERIC DEFAULT 0;

-- Backfill any NULLs (safety net)
UPDATE purchases SET overall_discount = 0 WHERE overall_discount IS NULL;
