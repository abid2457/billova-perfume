-- ==============================================================================
-- BILLOVA PERFUMES — MASTER SUPABASE DATABASE SETUP
-- ==============================================================================
-- Project URL : https://xpsopjgsxrutssxajezx.supabase.co
-- Description : Complete database schema, tables, indexes, RLS policies, 
--               realtime publications, and admin security functions.
--
-- HOW TO RUN:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/xpsopjgsxrutssxajezx
-- 2. Go to "SQL Editor" -> Click "New query"
-- 3. Paste this entire script and click "Run" (Ctrl + Enter)
-- 4. In "Storage" -> Create a new public bucket named: `invoices` (Public: YES, Max: 10MB)
-- ==============================================================================

-- ─── STEP 1: EXTENSIONS ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── STEP 2: TABLES ───────────────────────────────────────────────────────────

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- 4. Product Variants Table
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
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);

-- 5. Purchases Table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  billing_mode TEXT CHECK (billing_mode IN ('customer', 'quick')) DEFAULT 'customer',
  invoice_number TEXT UNIQUE NOT NULL,
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  overall_discount NUMERIC DEFAULT 0,
  payment_method TEXT,
  upi_account VARCHAR(10) CHECK (upi_account IN ('upi_1', 'upi_2', 'upi_3') OR upi_account IS NULL),
  invoice_image_url TEXT,
  invoice_pdf_url TEXT,
  printed_count INT DEFAULT 0,
  last_printed_at TIMESTAMPTZ,
  whatsapp_sent INT DEFAULT 0,
  whatsapp_sent_at TIMESTAMPTZ,
  whatsapp_message_id TEXT,
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  edited_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_customer ON purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_invoice ON purchases(invoice_number);
CREATE INDEX IF NOT EXISTS idx_purchases_billing_mode ON purchases(billing_mode, purchase_date DESC);

-- 6. Purchase Items Table
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  variant_label TEXT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_variant_id ON purchase_items(variant_id);

-- 7. Split / Mixed Payments Table
CREATE TABLE IF NOT EXISTS purchase_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  upi_account VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON purchase_payments(purchase_id);

-- 8. Receipt Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS receipt_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('print', 'whatsapp', 'pdf')),
  performed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  performed_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_receipt_logs_purchase ON receipt_logs(purchase_id);

-- 9. Settings Table (For Admin Passcode & Config)
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Purchase Edit Audit Logs Table
CREATE TABLE IF NOT EXISTS purchase_edit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  edited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  edited_by TEXT NOT NULL DEFAULT 'admin',
  changes_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_edit_logs_purchase ON purchase_edit_logs(purchase_id);

-- ─── STEP 3: ADMIN SECURITY FUNCTIONS ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_admin_passcode(input_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT setting_value INTO stored_hash
  FROM settings WHERE setting_key = 'admin_edit_passcode';
  IF stored_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN (crypt(input_passcode, stored_hash) = stored_hash);
END;
$$;

-- Allow authenticated admins to update admin passcode
CREATE OR REPLACE FUNCTION update_admin_passcode(new_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO settings (setting_key, setting_value, updated_at)
  VALUES ('admin_edit_passcode', crypt(new_passcode, gen_salt('bf')), now())
  ON CONFLICT (setting_key)
  DO UPDATE SET
    setting_value = crypt(new_passcode, gen_salt('bf')),
    updated_at = now();

  RETURN TRUE;
END;
$$;

-- Seed default admin passcode: 9789
INSERT INTO settings (setting_key, setting_value)
VALUES ('admin_edit_passcode', crypt('9789', gen_salt('bf')))
ON CONFLICT (setting_key)
DO UPDATE SET setting_value = crypt('9789', gen_salt('bf')), updated_at = NOW();

-- ─── STEP 4: ROW LEVEL SECURITY (RLS) ────────────────────────────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_edit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be idempotent
DROP POLICY IF EXISTS "auth_customers_all" ON customers;
DROP POLICY IF EXISTS "auth_categories_all" ON categories;
DROP POLICY IF EXISTS "auth_products_all" ON products;
DROP POLICY IF EXISTS "auth_variants_all" ON product_variants;
DROP POLICY IF EXISTS "auth_purchases_all" ON purchases;
DROP POLICY IF EXISTS "auth_purchase_items_all" ON purchase_items;
DROP POLICY IF EXISTS "auth_purchase_payments_all" ON purchase_payments;
DROP POLICY IF EXISTS "auth_receipt_logs_all" ON receipt_logs;
DROP POLICY IF EXISTS "deny_settings_direct" ON settings;
DROP POLICY IF EXISTS "auth_edit_logs_all" ON purchase_edit_logs;

-- Authenticated Full Access Policies
CREATE POLICY "auth_customers_all" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_categories_all" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_products_all" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_variants_all" ON product_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_purchases_all" ON purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_purchase_items_all" ON purchase_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_purchase_payments_all" ON purchase_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_receipt_logs_all" ON receipt_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_edit_logs_all" ON purchase_edit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Settings Table is restricted (access only via SECURITY DEFINER function)
CREATE POLICY "deny_settings_direct" ON settings FOR ALL USING (false);

-- Public / Anonymous Invoice Verification Access Policies (Read-Only)
DROP POLICY IF EXISTS "Public can view purchases by invoice" ON purchases;
CREATE POLICY "Public can view purchases by invoice" ON purchases FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can view purchase items" ON purchase_items;
CREATE POLICY "Public can view purchase items" ON purchase_items FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can view customers" ON customers;
CREATE POLICY "Public can view customers" ON customers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public can view purchase_payments" ON purchase_payments;
CREATE POLICY "Public can view purchase_payments" ON purchase_payments FOR SELECT TO anon USING (true);

-- ─── STEP 5: REALTIME SUBSCRIPTIONS ──────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE customers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE products;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE purchase_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE categories;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── STEP 6: INITIAL PRODUCT & CATEGORY SEED (OPTIONAL) ──────────────────────

INSERT INTO categories (category_name, description) VALUES
  ('Oud', 'Premium natural and distilled oudh fragrances'),
  ('Attar', 'Traditional non-alcoholic perfume oils'),
  ('Inspired', 'Designer and French style perfume impressions'),
  ('Musk', 'Pure white musk and rich floral blends'),
  ('Mukhallat', 'Exotic oriental perfume formulations')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO products (product_name, category, selling_price, description) VALUES
  ('Oud Royale', 'Oud', 2400, 'Royal cambodian oud blend'),
  ('Rose Attar', 'Attar', 650, 'Natural damascus rose oil'),
  ('Bleu Impression', 'Inspired', 1850, 'Fresh woody aromatic fragrance'),
  ('Musk Al Tahara', 'Musk', 320, 'Pure thick white musk'),
  ('Jasmine Sambac', 'Attar', 540, 'Pure floral jasmine extract'),
  ('Amber Oud', 'Oud', 2100, 'Warm amber and woody oudh'),
  ('Mukhallat Special', 'Mukhallat', 880, 'Signature oriental blend')
ON CONFLICT DO NOTHING;

-- Auto-seed default 100ml variant for initial products
INSERT INTO product_variants (product_id, ml, selling_price)
SELECT id, '100 ml', selling_price
FROM products
WHERE id NOT IN (SELECT DISTINCT product_id FROM product_variants)
ON CONFLICT (product_id, ml) DO NOTHING;
