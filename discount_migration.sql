-- ═══════════════════════════════════════════════════════════════════
-- Billova Perfumes — Discount Feature Migration
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add discount column (default 0 for backward compat)
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Backfill: set total as-is (old rows had no discount, so total = subtotal)
-- No data changes needed — existing rows already have discount = 0

-- ═══════════════════════════════════════════════════════════════════
-- Verify with:
-- SELECT product_name, quantity, unit_price,
--        (quantity * unit_price) as subtotal,
--        discount,
--        total
-- FROM purchase_items ORDER BY id DESC LIMIT 10;
-- ═══════════════════════════════════════════════════════════════════
