-- ═══════════════════════════════════════════════════════════════════
-- Billova Perfumes — Product Variants Migration
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ml            TEXT NOT NULL,
  variant_name  TEXT,
  selling_price NUMERIC(10,2) NOT NULL CHECK (selling_price > 0),
  sku           TEXT,
  barcode       TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, ml)
);

-- 2. Add variant_id column to purchase_items (nullable for old records)
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

-- 3. Add variant_label to purchase_items (snapshot of ML at time of purchase)
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS variant_label TEXT;

-- 4. Auto-migrate existing products → one default variant each
INSERT INTO product_variants (product_id, ml, selling_price)
SELECT
  id,
  '100 ml',
  selling_price
FROM products
WHERE id NOT IN (SELECT DISTINCT product_id FROM product_variants)
ON CONFLICT (product_id, ml) DO NOTHING;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_variant_id ON purchase_items(variant_id);

-- 6. Enable RLS
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- 7. RLS policy (drop first to avoid duplicate error on re-run)
DROP POLICY IF EXISTS "variants_auth_all" ON product_variants;
CREATE POLICY "variants_auth_all" ON product_variants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- Verify with:
-- SELECT p.product_name, v.ml, v.selling_price
-- FROM product_variants v JOIN products p ON v.product_id = p.id
-- ORDER BY p.product_name, v.ml;
-- ═══════════════════════════════════════════════════════════════════
