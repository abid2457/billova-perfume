-- ─── UPI Account Migration ────────────────────────────────────────────────────
-- Run in Supabase SQL Editor.
-- Adds upi_account column to purchases table for per-account UPI analytics.
-- Nullable VARCHAR — only populated when payment_method = 'UPI'.
-- Safe: existing rows get NULL (counted as "UPI Unspecified" in reports).

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS upi_account VARCHAR(10) DEFAULT NULL;

-- Optional: add a check constraint to restrict to known values
ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_upi_account_check;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_upi_account_check
  CHECK (upi_account IN ('upi_1', 'upi_2', 'upi_3') OR upi_account IS NULL);
